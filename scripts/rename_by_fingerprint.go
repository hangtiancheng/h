// Rename regular files recursively to <lowercase MD5><original extension>.
// Requires Go 1.25+ on macOS or Linux; uses only the standard library.
//
// Usage:
//
//	go run rename_by_fingerprint.go [options] [directory...]
//	go build -o rename-by-fingerprint rename_by_fingerprint.go
//
// Preview is the default. --apply directly renames verified sources and uses
// numbered suffixes for existing destinations, without deduplicating files.
// Each root's .meta.json caches MD5 values for files whose metadata is unchanged,
// including in preview mode.
// Close files before applying and avoid concurrent edits or renames: checking
// a destination and renaming the source are separate operations.
package main

import (
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"
)

const hashBufferSize = 1 << 20
const metadataFilename = ".meta.json"

var defaultExcludes = []string{
	".DS_Store", ".Spotlight-V100", ".Trashes", ".TemporaryItems", ".fseventsd",
	"System Volume Information", "$RECYCLE.BIN", "node_modules", ".git",
	".ssh", ".aws", ".gnupg", ".codex", ".agents", "Library",
}

type options struct {
	apply, dryRun, json, help, noDefaultExcludes bool
	concurrency                                  int
	excludes, roots                              []string
}

func parseOptions(args []string) (options, error) {
	opts := options{concurrency: 4}
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			opts.roots = append(opts.roots, args[i+1:]...)
			break
		}
		if !strings.HasPrefix(arg, "-") || arg == "-" {
			opts.roots = append(opts.roots, arg)
			continue
		}
		name, value, hasValue := strings.Cut(arg, "=")
		if name == "--exclude" || name == "--concurrency" {
			if !hasValue {
				i++
				if i == len(args) || strings.HasPrefix(args[i], "--") {
					return opts, fmt.Errorf("%s requires a value", name)
				}
				value = args[i]
			}
			if name == "--exclude" {
				if strings.TrimSpace(value) == "" {
					return opts, errors.New("--exclude requires a nonempty name or path")
				}
				opts.excludes = append(opts.excludes, value)
			} else {
				n, err := strconv.Atoi(value)
				if err != nil || n < 1 || n > 64 || strconv.Itoa(n) != value {
					return opts, errors.New("--concurrency must be an integer from 1 to 64")
				}
				opts.concurrency = n
			}
			continue
		}
		if hasValue {
			return opts, fmt.Errorf("%s does not accept a value", name)
		}
		switch name {
		case "--apply":
			opts.apply = true
		case "--dry-run":
			opts.dryRun = true
		case "--json":
			opts.json = true
		case "--no-default-excludes":
			opts.noDefaultExcludes = true
		case "--help", "-h":
			opts.help = true
		default:
			return opts, fmt.Errorf("unknown option: %s", name)
		}
	}
	if opts.apply && opts.dryRun {
		return opts, errors.New("--apply and --dry-run cannot be combined")
	}
	if opts.apply && len(opts.roots) == 0 && !opts.help {
		return opts, errors.New("--apply requires an explicit directory")
	}
	return opts, nil
}

func printHelp(out io.Writer) {
	fmt.Fprintf(out, `Rename files recursively to their MD5 fingerprint, preserving extensions.

Usage: go run rename_by_fingerprint.go [options] [directory...]

  --apply                 Perform renames; requires an explicit directory.
  --dry-run               Preview only (default; current directory if omitted).
  --exclude <name|path>   Exclude an entry name or path; repeatable.
  --no-default-excludes   Disable built-in exclusions.
  --concurrency <n>       Parallel hash workers, 1 to 64 (default: 4).
  --json                  Write one JSON report; disable progress output.
  --help, -h              Display this help.

Requires Go 1.25+ on macOS or Linux. Hashes whole files, using 1 MiB per worker.
Each directory argument stores an MD5 cache in .meta.json, also in preview mode.
Files with unchanged size, modification time and change time reuse cached MD5s.
Progress is written to stderr every second during hashing.
Existing destination names and duplicate hashes receive numbered suffixes.
File contents and extension case are preserved. Renames do not need hard links.
Close files before applying and avoid concurrent edits or renames.
Built-in exclusions: %s
Exit codes: 0 completed, 1 file or directory errors, 2 invalid usage.
`, strings.Join(defaultExcludes, ", "))
}

func pathKey(filename string) string {
	if runtime.GOOS == "darwin" {
		return strings.ToLower(filename)
	}
	return filename
}

func inside(parent, child string) bool {
	relative, err := filepath.Rel(parent, child)
	return err == nil && relative != ".." &&
		!strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative)
}

func sameFile(first, second os.FileInfo) bool {
	return first != nil && second != nil && os.SameFile(first, second) && first.Mode() == second.Mode()
}

// The Unix ctime field is named Ctimespec on macOS and Ctim on Linux.
// Comparing it also detects edits that restore the original size and mtime.
func changeTime(info os.FileInfo) time.Time {
	stat := reflect.Indirect(reflect.ValueOf(info.Sys()))
	for _, name := range []string{"Ctimespec", "Ctim"} {
		if field := stat.FieldByName(name); field.IsValid() {
			return time.Unix(field.FieldByName("Sec").Int(), field.FieldByName("Nsec").Int())
		}
	}
	return time.Time{}
}

func sameContents(first, second os.FileInfo) bool {
	return sameFile(first, second) && first.Size() == second.Size() &&
		first.ModTime().Equal(second.ModTime()) && changeTime(first).Equal(changeTime(second))
}

type directoryChecks struct {
	mu         sync.Mutex
	identities map[string]os.FileInfo
}

func newDirectoryChecks() *directoryChecks {
	return &directoryChecks{identities: make(map[string]os.FileInfo)}
}

func (checks *directoryChecks) check(directory string) error {
	var chain []string
	for current := directory; ; current = filepath.Dir(current) {
		chain = append(chain, current)
		if filepath.Dir(current) == current {
			break
		}
	}
	for i := len(chain) - 1; i >= 0; i-- {
		current := chain[i]
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("directory is no longer a regular directory: %q", current)
		}
		checks.mu.Lock()
		previous := checks.identities[current]
		if previous == nil {
			checks.identities[current] = info
		}
		checks.mu.Unlock()
		if previous != nil && !sameFile(previous, info) {
			return fmt.Errorf("directory changed during processing: %q", current)
		}
	}
	return nil
}

type exclusions struct {
	names map[string]bool
	paths []string
}

func makeExclusions(opts options) (exclusions, error) {
	excludes := exclusions{names: make(map[string]bool)}
	if !opts.noDefaultExcludes {
		for _, name := range defaultExcludes {
			excludes.names[pathKey(name)] = true
		}
	}
	for _, item := range opts.excludes {
		if strings.ContainsAny(item, `/\`) {
			if strings.HasPrefix(item, "~/") {
				home, err := os.UserHomeDir()
				if err != nil {
					return excludes, err
				}
				item = filepath.Join(home, item[2:])
			}
			absolute, err := filepath.Abs(item)
			if err != nil {
				return excludes, err
			}
			excludes.paths = append(excludes.paths, pathKey(absolute))
		} else {
			excludes.names[pathKey(item)] = true
		}
	}
	return excludes, nil
}

func (excludes exclusions) matches(filename string) bool {
	if excludes.names[pathKey(filepath.Base(filename))] {
		return true
	}
	for _, excluded := range excludes.paths {
		if inside(excluded, pathKey(filename)) {
			return true
		}
	}
	return false
}

type collection struct {
	files      []string
	errors     []string
	skipped    int
	totalBytes int64
}

func collectFiles(roots []string, excludes exclusions, checks *directoryChecks) collection {
	collected := collection{files: []string{}, errors: []string{}}
	seen := make(map[string]bool)
	var ownFiles []os.FileInfo
	if executable, err := os.Executable(); err == nil {
		if info, err := os.Stat(executable); err == nil {
			ownFiles = append(ownFiles, info)
		}
	}
	if _, source, _, ok := runtime.Caller(0); ok {
		if info, err := os.Stat(source); err == nil {
			ownFiles = append(ownFiles, info)
		}
	}
	addError := func(filename string, err error) {
		collected.errors = append(collected.errors, fmt.Sprintf("%q: %v", filename, err))
	}
	var walk func(string)
	walk = func(directory string) {
		if err := checks.check(directory); err != nil {
			addError(directory, err)
			return
		}
		entries, err := os.ReadDir(directory)
		if err != nil {
			addError(directory, err)
			return
		}
		for _, entry := range entries {
			filename := filepath.Join(directory, entry.Name())
			if entry.Name() == metadataFilename || strings.HasPrefix(entry.Name(), metadataFilename+"-") {
				continue
			}
			if excludes.matches(filename) || entry.Type()&os.ModeSymlink != 0 {
				collected.skipped++
				continue
			}
			if entry.IsDir() {
				walk(filename)
				continue
			}
			if !entry.Type().IsRegular() {
				collected.skipped++
				continue
			}
			if err := checks.check(directory); err != nil {
				addError(filename, err)
				continue
			}
			info, err := os.Lstat(filename)
			if err != nil {
				addError(filename, err)
				continue
			}
			self := false
			for _, own := range ownFiles {
				self = self || sameFile(own, info)
			}
			if !info.Mode().IsRegular() || self {
				collected.skipped++
				continue
			}
			if !seen[filename] {
				seen[filename] = true
				collected.files = append(collected.files, filename)
				collected.totalBytes += info.Size()
			}
		}
	}
	for _, root := range roots {
		if excludes.matches(root) {
			collected.skipped++
		} else {
			walk(root)
		}
	}
	sort.Strings(collected.files)
	return collected
}

type fingerprint struct {
	file, hash string
	stat       os.FileInfo
	err        error
}

type metadataEntry struct {
	MD5     string `json:"md5"`
	Size    int64  `json:"size"`
	MtimeNS int64  `json:"mtimeNs"`
	CtimeNS int64  `json:"ctimeNs"`
}

type metadata struct {
	Files map[string]metadataEntry `json:"files"`
}

func loadMetadata(roots []string) map[string]metadataEntry {
	entries := make(map[string]metadataEntry)
	for _, root := range roots {
		file, err := os.OpenFile(filepath.Join(root, metadataFilename), os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
		if err != nil {
			continue // Missing or unreadable caches simply cause a fresh hash.
		}
		var stored metadata
		err = json.NewDecoder(file).Decode(&stored)
		_ = file.Close()
		if err != nil {
			continue
		}
		for name, entry := range stored.Files {
			if filepath.IsLocal(name) {
				entries[filepath.Join(root, name)] = entry
			}
		}
	}
	return entries
}

func fingerprintFromCache(filename string, entry metadataEntry, checks *directoryChecks) (fingerprint, bool) {
	if len(entry.MD5) != md5.Size*2 || entry.MD5 != strings.ToLower(entry.MD5) {
		return fingerprint{}, false
	}
	if _, err := hex.DecodeString(entry.MD5); err != nil {
		return fingerprint{}, false
	}
	if err := checks.check(filepath.Dir(filename)); err != nil {
		return fingerprint{}, false
	}
	info, err := os.Lstat(filename)
	if err != nil || !info.Mode().IsRegular() || info.Size() != entry.Size ||
		info.ModTime().UnixNano() != entry.MtimeNS || changeTime(info).UnixNano() != entry.CtimeNS {
		return fingerprint{}, false
	}
	return fingerprint{file: filename, hash: entry.MD5, stat: info}, true
}

func saveMetadata(root string, values []fingerprint, inodeStates map[string]os.FileInfo, checks *directoryChecks) error {
	if err := checks.check(root); err != nil {
		return err
	}
	stored := metadata{Files: make(map[string]metadataEntry)}
	for _, value := range values {
		if value.err != nil || !inside(root, value.file) {
			continue
		}
		expected := value.stat
		if saved := inodeStates[inodeKey(value.stat)]; saved != nil {
			expected = saved // Our own renames can change ctime, including on hard links.
		}
		current, err := os.Lstat(value.file)
		if err != nil || !sameContents(expected, current) {
			continue
		}
		name, err := filepath.Rel(root, value.file)
		if err != nil {
			return err
		}
		stored.Files[name] = metadataEntry{value.hash, current.Size(), current.ModTime().UnixNano(), changeTime(current).UnixNano()}
	}
	file, err := os.CreateTemp(root, metadataFilename+"-*")
	if err != nil {
		return err
	}
	defer os.Remove(file.Name())
	err = writeJSON(file, stored)
	closeErr := file.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(file.Name(), filepath.Join(root, metadataFilename))
}

type hashProgress struct {
	bytes atomic.Int64
	files atomic.Int64
}

type progressReader struct {
	reader   io.Reader
	progress *hashProgress
}

func (reader progressReader) Read(buffer []byte) (int, error) {
	n, err := reader.reader.Read(buffer)
	reader.progress.bytes.Add(int64(n))
	return n, err
}

func fingerprintFile(filename string, checks *directoryChecks, buffer []byte, progress *hashProgress) (value fingerprint) {
	value.file = filename
	if value.err = checks.check(filepath.Dir(filename)); value.err != nil {
		return
	}
	expected, err := os.Lstat(filename)
	if err != nil {
		value.err = err
		return
	}
	if !expected.Mode().IsRegular() {
		value.err = errors.New("only regular files can be fingerprinted")
		return
	}
	// O_NONBLOCK also avoids hanging if a file is replaced with a FIFO.
	file, err := os.OpenFile(filename, os.O_RDONLY|syscall.O_NOFOLLOW|syscall.O_NONBLOCK, 0)
	if err != nil {
		value.err = err
		return
	}
	defer func() {
		if err := file.Close(); value.err == nil {
			value.err = err
		}
	}()
	before, err := file.Stat()
	if err != nil {
		value.err = err
		return
	}
	if !before.Mode().IsRegular() || !sameContents(expected, before) {
		value.err = errors.New("file changed before hashing")
		return
	}
	hash := md5.New()
	if _, value.err = io.CopyBuffer(hash, progressReader{file, progress}, buffer); value.err != nil {
		return
	}
	after, err := file.Stat()
	if err != nil {
		value.err = err
		return
	}
	if value.err = checks.check(filepath.Dir(filename)); value.err != nil {
		return
	}
	current, err := os.Lstat(filename)
	if err != nil {
		value.err = err
		return
	}
	if !sameContents(before, after) || !sameContents(after, current) {
		value.err = errors.New("file changed during hashing")
		return
	}
	value.hash = hex.EncodeToString(hash.Sum(nil))
	value.stat = after
	return
}

func fingerprintFiles(files []string, concurrency int, checks *directoryChecks, progress *hashProgress) []fingerprint {
	results := make([]fingerprint, len(files))
	jobs := make(chan int)
	var workers sync.WaitGroup
	for range min(concurrency, len(files)) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			buffer := make([]byte, hashBufferSize)
			for index := range jobs {
				results[index] = fingerprintFile(files[index], checks, buffer, progress)
				progress.files.Add(1)
			}
		}()
	}
	for index := range files {
		jobs <- index
	}
	close(jobs)
	workers.Wait()
	return results
}

func startProgress(out io.Writer, progress *hashProgress, totalFiles int, totalBytes int64) func() {
	stop, stopped := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(stopped)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		started := time.Now()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				bytes := progress.bytes.Load()
				fmt.Fprintf(out, "HASHING: %d/%d files, %.2f/%.2f GiB read, %.1f MiB/s\n",
					progress.files.Load(), totalFiles, float64(bytes)/(1<<30),
					float64(totalBytes)/(1<<30), float64(bytes)/(1<<20)/time.Since(started).Seconds())
			}
		}
	}()
	return func() { close(stop); <-stopped }
}

// Match Node's extname for dotfiles and preserve the extension's case.
func extension(filename string) string {
	base := filepath.Base(filename)
	index := strings.LastIndexByte(base, '.')
	if index <= 0 || base == ".." {
		return ""
	}
	return base[index:]
}

func alreadyNamed(source, hash string) bool {
	base := strings.TrimSuffix(filepath.Base(source), extension(source))
	if base == hash {
		return true
	}
	suffix, found := strings.CutPrefix(base, hash+"-")
	if !found || len(suffix) == 0 || suffix[0] < '1' || suffix[0] > '9' {
		return false
	}
	for _, digit := range suffix {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

type targetPicker struct {
	occupied map[string]bool
	next     map[string]int
}

func newTargetPicker(files []string) *targetPicker {
	picker := &targetPicker{occupied: make(map[string]bool), next: make(map[string]int)}
	for _, file := range files {
		picker.occupied[pathKey(file)] = true
	}
	return picker
}

func (picker *targetPicker) pick(source, hash string) (string, error) {
	ext := extension(source)
	key := pathKey(filepath.Join(filepath.Dir(source), hash+ext))
	// Remember the next suffix so a group of duplicates takes linear work.
	for suffix := picker.next[key]; ; suffix++ {
		name := hash
		if suffix != 0 {
			name += "-" + strconv.Itoa(suffix)
		}
		target := filepath.Join(filepath.Dir(source), name+ext)
		if picker.occupied[pathKey(target)] {
			continue
		}
		if _, err := os.Lstat(target); err == nil {
			picker.occupied[pathKey(target)] = true
			continue
		} else if !errors.Is(err, os.ErrNotExist) {
			return "", err
		}
		picker.occupied[pathKey(target)] = true
		picker.next[key] = suffix + 1
		return target, nil
	}
}

func inodeKey(info os.FileInfo) string {
	stat := info.Sys().(*syscall.Stat_t)
	return fmt.Sprintf("%d:%d", stat.Dev, stat.Ino)
}

func renameFile(original fingerprint, target string, checks *directoryChecks, inodeStates map[string]os.FileInfo) error {
	source := original.file
	if filepath.Dir(source) != filepath.Dir(target) {
		return errors.New("destination must be in the source directory")
	}
	if err := checks.check(filepath.Dir(source)); err != nil {
		return err
	}
	inode := inodeKey(original.stat)
	expected := original.stat
	if saved := inodeStates[inode]; saved != nil {
		expected = saved
	}
	before, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if !before.Mode().IsRegular() || !sameContents(expected, before) {
		return errors.New("file changed after fingerprinting")
	}
	if _, err := os.Lstat(target); err == nil {
		return &os.LinkError{Op: "rename", Old: source, New: target, Err: os.ErrExist}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.Rename(source, target); err != nil {
		return err
	}
	final, err := os.Lstat(target)
	if err == nil {
		inodeStates[inode] = final
	}
	return err
}

type renameResult struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Hash   string `json:"hash"`
	Status string `json:"status"`
}

type report struct {
	Apply       bool           `json:"apply"`
	Roots       []string       `json:"roots"`
	TotalFiles  int            `json:"totalFiles"`
	CachedFiles int            `json:"cachedFiles"`
	HashedFiles int            `json:"hashedFiles"`
	Renamed     int            `json:"renamed"`
	WouldRename int            `json:"wouldRename"`
	Unchanged   int            `json:"unchanged"`
	Skipped     int            `json:"skipped"`
	Failures    int            `json:"failures"`
	Results     []renameResult `json:"results"`
	Errors      []string       `json:"errors"`
}

func resolveRoots(opts options, checks *directoryChecks) ([]string, []string) {
	roots, failures := []string{}, []string{}
	inputs := opts.roots
	if len(inputs) == 0 {
		inputs = []string{"."}
	}
	for _, input := range inputs {
		root, err := resolveRoot(input, opts.apply, checks)
		if err != nil {
			failures = append(failures, fmt.Sprintf("%q: %v", input, err))
		} else {
			roots = append(roots, root)
		}
	}
	sort.Strings(roots)
	unique := []string{}
	for _, root := range roots {
		covered := false
		for _, parent := range unique {
			covered = covered || inside(parent, root)
		}
		if !covered {
			unique = append(unique, root)
		}
	}
	if len(unique) == 0 {
		failures = append(failures, "no valid directories to process")
	}
	return unique, failures
}

func resolveRoot(input string, apply bool, checks *directoryChecks) (string, error) {
	absolute, err := filepath.Abs(input)
	if err != nil {
		return "", err
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return "", err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("expected a regular directory, not a symbolic link")
	}
	root, err := filepath.EvalSymlinks(absolute)
	if err != nil {
		return "", err
	}
	if apply {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		home, err = filepath.EvalSymlinks(home)
		if err != nil {
			return "", err
		}
		if root == filepath.Dir(root) || root == home {
			return "", errors.New("applying to the filesystem root or entire home directory is not allowed")
		}
	}
	return root, checks.check(root)
}

func writeJSON(out io.Writer, value any) error {
	encoder := json.NewEncoder(out)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}

func run(args []string, out, stderr io.Writer) int {
	opts, err := parseOptions(args)
	if err != nil {
		jsonOutput := opts.json
		for _, arg := range args {
			jsonOutput = jsonOutput || arg == "--json"
		}
		if jsonOutput {
			_ = writeJSON(stderr, map[string]any{"error": err.Error(), "exitCode": 2})
		} else {
			fmt.Fprintf(stderr, "ERROR: %v\n", err)
		}
		return 2
	}
	if opts.help {
		printHelp(out)
		return 0
	}
	checks := newDirectoryChecks()
	roots, failures := resolveRoots(opts, checks)
	excludes, err := makeExclusions(opts)
	if err != nil {
		fmt.Fprintf(stderr, "ERROR: %v\n", err)
		return 1
	}
	mode := "DRY RUN"
	if opts.apply {
		mode = "APPLY"
	}
	if !opts.json {
		quoted := make([]string, len(roots))
		for i, root := range roots {
			quoted[i] = strconv.Quote(root)
		}
		fmt.Fprintf(out, "%s: %s\n", mode, strings.Join(quoted, ", "))
	}
	collected := collectFiles(roots, excludes, checks)
	failures = append(failures, collected.errors...)
	var cacheRoots []string
	for _, root := range roots {
		if !excludes.matches(root) {
			cacheRoots = append(cacheRoots, root)
		}
	}
	cache := loadMetadata(cacheRoots)
	fingerprints := make([]fingerprint, len(collected.files))
	var pendingFiles []string
	var pendingIndices []int
	bytesToHash := collected.totalBytes
	for index, filename := range collected.files {
		if value, hit := fingerprintFromCache(filename, cache[filename], checks); hit {
			fingerprints[index] = value
			bytesToHash -= value.stat.Size()
		} else {
			pendingFiles = append(pendingFiles, filename)
			pendingIndices = append(pendingIndices, index)
		}
	}
	cachedFiles := len(collected.files) - len(pendingFiles)
	progress := &hashProgress{}
	stopProgress := func() {}
	if !opts.json {
		fmt.Fprintf(out, "CACHE: %d/%d files reused.\n", cachedFiles, len(collected.files))
		fmt.Fprintf(out, "HASHING: %d regular files.\n", len(pendingFiles))
		stopProgress = startProgress(stderr, progress, len(pendingFiles), bytesToHash)
	}
	for index, value := range fingerprintFiles(pendingFiles, opts.concurrency, checks, progress) {
		fingerprints[pendingIndices[index]] = value
	}
	stopProgress()
	picker := newTargetPicker(collected.files)
	inodeStates := make(map[string]os.FileInfo)
	result := report{Apply: opts.apply, Roots: roots, TotalFiles: len(collected.files),
		CachedFiles: cachedFiles, HashedFiles: len(pendingFiles),
		Skipped: collected.skipped, Results: []renameResult{}, Errors: failures}
	for index, value := range fingerprints {
		if value.err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%q: %v", value.file, value.err))
			continue
		}
		if alreadyNamed(value.file, value.hash) {
			result.Unchanged++
			continue
		}
		target, err := picker.pick(value.file, value.hash)
		if opts.apply {
			for err == nil {
				err = renameFile(value, target, checks, inodeStates)
				if !errors.Is(err, os.ErrExist) {
					break
				}
				target, err = picker.pick(value.file, value.hash)
			}
		}
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%q -> %q: %v", value.file, target, err))
			continue
		}
		status, action := "would-rename", "WOULD RENAME"
		if opts.apply {
			status, action = "renamed", "RENAMED"
			result.Renamed++
			fingerprints[index].file = target
		} else {
			result.WouldRename++
		}
		result.Results = append(result.Results, renameResult{value.file, target, value.hash, status})
		if !opts.json {
			fmt.Fprintf(out, "%s: %q -> %q\n", action, value.file, target)
		}
	}
	for _, root := range cacheRoots {
		if err := saveMetadata(root, fingerprints, inodeStates, checks); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("%q: %v", filepath.Join(root, metadataFilename), err))
		}
	}
	result.Failures = len(result.Errors)
	if opts.json {
		if err := writeJSON(out, result); err != nil {
			fmt.Fprintf(stderr, "ERROR: %v\n", err)
			return 1
		}
	} else {
		for _, failure := range result.Errors {
			fmt.Fprintf(stderr, "SKIPPED: %s\n", failure)
		}
		action := "planned"
		if opts.apply {
			action = "renamed"
		}
		fmt.Fprintf(out, "Completed: %d %s, %d unchanged, %d errors.\n", len(result.Results), action, result.Unchanged, result.Failures)
		if !opts.apply && len(result.Results) != 0 {
			fmt.Fprintln(out, "Preview only. Use --apply with an explicit directory to perform the renames.")
		}
	}
	if result.Failures != 0 {
		return 1
	}
	return 0
}

func main() {
	os.Exit(run(os.Args[1:], os.Stdout, os.Stderr))
}
