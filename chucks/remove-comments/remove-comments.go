// remove-comments.go — single-file Go tool that strips comments from source code.
//
// Usage:
//
//	go run remove-comments.go                      # process the current directory
//	go run remove-comments.go /path/to/git/repo    # process a directory (absolute or relative)
//	go run remove-comments.go a.go ./src b.tsx     # several files / directories
//	go run remove-comments.go -diff .              # preview the diff without writing
//
// Note: `go run` treats any argument ending in ".go" as a source file to
// compile, so a target whose name ends in ".go" (e.g. a repo directory named
// yukino.go) must be passed after a "--" separator or with a trailing slash:
//
//	go run remove-comments.go -dry -- yukino.go
//	go run remove-comments.go -dry yukino.go/
//
// Rules:
//   - If the target directory is inside a git repository, only git-tracked files are
//     processed (git ls-files --cached); otherwise all files are processed recursively
//     (built-in exclusions apply: node_modules, dist, *.min.*, lock files, ...).
//   - Files are modified in place by default; preview first with -dry or -diff.
//   - Functional comments (shebangs, //go:build, eslint-disable, /*! ... */, CSS @license,
//     PowerShell help blocks, HTML conditional comments, ...) are kept by default;
//     pass -directives=false to remove them as well.
//
// Supported languages (by extension or file name):
//
//	Go; JS/JSX/TS/TSX (js, jsx, ts, tsx, mjs, cjs, mts, cts); CSS/SCSS/Sass/Less;
//	Markdown/MDX; HTML/XML/SVG/Vue/Svelte; C/C++ (c, h, cc, cxx, cpp, c++, hpp, ...);
//	Java, Kotlin, C#, Swift, Dart, Scala, PHP, Rust, Zig, Solidity, Proto, Prisma, JSONC;
//	Sh/Bash/Zsh/Fish/..., PowerShell; Dockerfile, Makefile, CMake;
//	Python, Ruby, Perl, R, Elixir, Julia, Nim, Crystal, CoffeeScript;
//	YAML, TOML, INI, .env, .properties, ignore files; SQL, Lua, Haskell, OCaml,
//	Lisp/Clojure/Scheme, Erlang, Batch, Nix, Terraform, GraphQL;
//	Twig/Nunjucks/Jinja, Handlebars/Mustache, EJS, ERB, JSP/ASP, Razor, Blade.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"
	"sync"
	"unicode/utf8"
)

// ---------------------------------------------------------------------------
// flags
// ---------------------------------------------------------------------------

var (
	flagDry              = flag.Bool("dry", false, "report files that would change without writing them")
	flagDiff             = flag.Bool("diff", false, "print a unified diff (implies -dry)")
	flagVerbose          = flag.Bool("v", false, "also print skipped files with their reason")
	flagQuiet            = flag.Bool("q", false, "only print errors and the final summary")
	flagBackup           = flag.Bool("backup", false, "keep a <file>.bak backup before overwriting")
	flagDirectives       = flag.Bool("directives", true, "keep functional comments (shebangs, //go:build, eslint-disable, /*! ... */, ...)")
	flagKeepLicense      = flag.Bool("keep-license", false, "keep comments containing copyright / license / SPDX markers")
	flagKeepRe           = flag.String("keep-re", "", "comma-separated regexps; matching comments are kept")
	flagExt              = flag.String("ext", "", "only process these extensions, comma separated, e.g. .go,.ts,.tsx")
	flagExclude          = flag.String("exclude", "", "extra exclusion globs, comma separated, e.g. vendor/*,*.pb.go")
	flagNoDefaultExclude = flag.Bool("no-default-excludes", false, "disable built-in exclusions (node_modules, dist, *.min.js, lock files, ...)")
	flagSqueeze          = flag.Bool("squeeze", false, "collapse runs of consecutive blank lines into one")
	flagJobs             = flag.Int("jobs", runtime.NumCPU(), "number of concurrent workers")
	flagMaxSize          = flag.Int64("max-size", 8<<20, "skip files larger than this many bytes")
	flagNoGit            = flag.Bool("no-git", false, "walk all files even when inside a git repository")
	flagAllowInvalidUTF8 = flag.Bool("allow-invalid-utf8", false, "do not skip non-UTF-8 files (may produce mojibake)")
)

func usage() {
	w := flag.CommandLine.Output()
	fmt.Fprint(w, `remove-comments — strip all comments (single line + multi line) from source code

Usage:
  go run remove-comments.go [flags] [path ...]

  path may be a file or a directory, absolute or relative; defaults to ".".
  A directory inside a git repository -> only git-tracked files are processed;
  otherwise every file below it is processed recursively.

Options:
`)
	flag.PrintDefaults()
	fmt.Fprint(w, `
Examples:
  go run remove-comments.go -diff .                 # preview changes of the current repo
  go run remove-comments.go /path/to/a/git/repo     # rewrite the given repository in place
  go run remove-comments.go -ext .go,.ts ./src      # only process Go / TypeScript
  go run remove-comments.go -directives=false .     # also remove functional comments
  go run remove-comments.go -keep-license -backup . # keep copyright headers, with backups

Note: 'go run' treats any argument ending in ".go" as a source file, so a
target with such a name (e.g. a repo directory called yukino.go) must be
passed after "--" or with a trailing slash:

  go run remove-comments.go -dry -- yukino.go
  go run remove-comments.go -dry yukino.go/
`)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	flag.Usage = usage
	flag.Parse()
	if *flagDiff {
		*flagDry = true
	}
	initFilters()

	k, err := newKeeper()
	if err != nil {
		fmt.Fprintln(os.Stderr, "remove-comments:", err)
		os.Exit(2)
	}

	args := flag.Args()
	if len(args) == 0 {
		args = []string{"."}
	}

	files, mode, err := collectFiles(args)
	if err != nil {
		fmt.Fprintln(os.Stderr, "remove-comments:", err)
		os.Exit(2)
	}
	if len(files) == 0 {
		if !*flagQuiet {
			fmt.Printf("no files to process (%s).\n", mode)
		}
		return
	}

	results := runAll(files, k)
	os.Exit(report(results, mode, len(files)))
}

// ---------------------------------------------------------------------------
// keeper — decides whether an individual comment must be preserved
// ---------------------------------------------------------------------------

type keeper struct {
	directives  bool
	keepLicense bool
	res         []*regexp.Regexp
}

func newKeeper() (*keeper, error) {
	k := &keeper{directives: *flagDirectives, keepLicense: *flagKeepLicense}
	if s := strings.TrimSpace(*flagKeepRe); s != "" {
		for _, p := range strings.Split(s, ",") {
			p = strings.TrimSpace(p)
			if p == "" {
				continue
			}
			re, err := regexp.Compile(p)
			if err != nil {
				return nil, fmt.Errorf("invalid -keep-re pattern %q: %w", p, err)
			}
			k.res = append(k.res, re)
		}
	}
	return k, nil
}

var (
	licenseRe         = regexp.MustCompile(`(?i)\b(copyright|licence|license|spdx-license-identifier)\b`)
	dockerDirectiveRe = regexp.MustCompile(`(?i)^(syntax|escape|check)\s*=`)
)

// keep reports whether a comment must be preserved. marker is the opening
// delimiter ("//", "/*", "#", "<!--", ...), body is the comment text without
// delimiters, and firstLine tells whether it starts at byte 0 of the file.
func (k *keeper) keep(lang, marker, body string, firstLine bool) bool {
	if k == nil {
		return false
	}
	// shebangs are never removed
	if firstLine && body != "" && body[0] == '!' && strings.HasPrefix(marker, "#") {
		return true
	}
	t := strings.TrimSpace(body)
	t = strings.TrimLeft(t, "*#; \t")
	t = strings.TrimSpace(t)
	for _, re := range k.res {
		if re.MatchString(body) {
			return true
		}
	}
	if k.keepLicense && licenseRe.MatchString(body) {
		return true
	}
	if !k.directives {
		return false
	}
	// /*! ... */ legal notices
	if strings.HasPrefix(marker, "/*") && strings.HasPrefix(body, "!") {
		return true
	}
	if strings.HasPrefix(marker, "/*") && (strings.HasPrefix(t, "@license") || strings.HasPrefix(t, "@preserve")) {
		return true
	}
	// Haskell pragma: {-# LANGUAGE ... #-}
	if lang == "haskell" && strings.HasPrefix(strings.TrimSpace(body), "#") {
		return true
	}
	return isDirective(lang, t)
}

// Functional comment prefixes shared by most languages.
var genericDirectives = []string{
	"nolint", "noqa", "nosec", "type: ignore", "type:ignore",
	"prettier-ignore", "prettier-ignore-start", "prettier-ignore-end",
	"clang-format off", "clang-format on", "clang-format:",
	"fmt: off", "fmt: on", "fmt: skip", "format: off", "format: on",
	"istanbul ignore", "c8 ignore", "v8 ignore", "coverage:ignore", "coverage: ignore",
	"lcov_excl", "gcovr_excl", "cppcheck-suppression",
	"#region", "#endregion", "region ", "endregion",
	"sourcemappingurl", "sourceurl",
	"@__pure__", "__pure__", "@__no_side_effects__",
	"@license", "@preserve", "@cc_on",
	"eslint-disable", "eslint-enable", "eslint ", "eslint- ", "eslint:",
	"biome-ignore", "stylelint-disable", "stylelint-enable", "stylelint-",
	"tslint:disable", "tslint:enable", "tslint:",
	"@ts-ignore", "@ts-expect-error", "@ts-nocheck", "@ts-check",
	"deno-lint-ignore", "bun-lint",
	"webpackchunkname", "webpackignore", "webpackprefetch", "webpackpreload", "webpackmode", "webpackexports", "webpackinclude",
	"@vite-ignore", "vite-ignore",
	"shellcheck ", "shellcheck- ",
	"pylint:", "flake8:", "mypy:", "ruff:", "isort:", "yapf:", "black:", "pragma: no cover",
	"@flow", "@noflow", "@jsx", "@jsximportsource", "@jsxruntime",
	"yamllint", "yaml-language-server",
	"istanbul",
}

func isDirective(lang, t string) bool {
	if t == "" {
		return false
	}
	low := strings.ToLower(t)
	for _, d := range genericDirectives {
		if strings.HasPrefix(low, d) {
			return true
		}
	}
	switch lang {
	case "go":
		for _, p := range []string{"go:", "+build", "line ", "line:", "export ", "extern ", "lint:", "lint:ignore"} {
			if strings.HasPrefix(t, p) {
				return true
			}
		}
		// C code / directives inside cgo preamble comments
		for _, p := range []string{"#cgo", "#include", "#define", "#ifdef", "#ifndef", "#endif", "#if ", "#else", "#elif", "#pragma", "#error", "#warning", "#undef", "#import"} {
			if strings.HasPrefix(t, p) {
				return true
			}
		}
	case "c", "cpp":
		for _, p := range []string{"NOLINT", "NOLINTNEXTLINE", "NOLINTBEGIN", "NOLINTEND", "*INDENT-OFF*", "*INDENT-ON*"} {
			if strings.HasPrefix(t, p) {
				return true
			}
		}
	case "js", "ts", "css":
		// TypeScript triple-slash references: /// <reference path="..." />
		if strings.HasPrefix(t, "/ <reference") || strings.HasPrefix(t, "//") || strings.HasPrefix(t, "<reference") {
			return true
		}
	case "docker":
		if dockerDirectiveRe.MatchString(t) {
			return true
		}
	case "ps":
		if strings.HasPrefix(low, "#requires") || strings.HasPrefix(low, "requires -") {
			return true
		}
		if strings.HasPrefix(t, ".") {
			for _, h := range []string{".SYNOPSIS", ".DESCRIPTION", ".PARAMETER", ".EXAMPLE", ".INPUTS", ".OUTPUTS", ".NOTES", ".LINK", ".COMPONENT", ".ROLE", ".FUNCTIONALITY", ".FORWARDHELPTARGETNAME", ".FORWARDHELP", ".REMOTEHELPRUNSPACE", ".EXTERNALHELP"} {
				if strings.HasPrefix(t, h) {
					return true
				}
			}
		}
	case "python":
		if strings.Contains(low, "coding:") || strings.Contains(low, "coding=") || strings.Contains(low, "-*-") {
			return true
		}
	case "html":
		if strings.HasPrefix(low, "[if ") || strings.HasPrefix(low, "[elif ") || strings.HasPrefix(low, "[else") || strings.HasPrefix(low, "[endif") {
			return true
		}
		if strings.HasPrefix(t, "#") { // SSI: <!--#include virtual="..." -->
			return true
		}
	case "yaml":
		if strings.HasPrefix(low, "!") { // tags such as !Ref / !Sub
			return true
		}
	}
	return false
}

// ---------------------------------------------------------------------------
// file collection
// ---------------------------------------------------------------------------

var defaultSkipDirs = map[string]bool{
	".git": true, ".hg": true, ".svn": true,
	"node_modules": true, "bower_components": true, "jspm_packages": true,
	"vendor": true, "third_party": true, "3rdparty": true, "external": true,
	"dist": true, "build": true, "out": true, "target": true, "bin": true, "obj": true,
	".next": true, ".nuxt": true, ".output": true, ".svelte-kit": true, ".astro": true,
	".cache": true, ".parcel-cache": true, ".turbo": true, ".vite": true,
	"coverage": true, ".nyc_output": true,
	"__pycache__": true, ".venv": true, "venv": true, "env": true, ".tox": true,
	".mypy_cache": true, ".pytest_cache": true, ".ruff_cache": true, ".gradle": true,
	".terraform": true, "Pods": true, ".idea": true, ".vs": true, "DerivedData": true,
	".codegraph": true, ".yukino": true, ".agents": true,
}

var defaultSkipFiles = []string{
	"*.min.js", "*.min.cjs", "*.min.mjs", "*.min.css",
	"*.map", "*.lock", "*.lockb", "*.sum",
	"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json",
	"bun.lock", "bun.lockb", "cargo.lock", "composer.lock", "gemfile.lock",
	"poetry.lock", "pdm.lock", "uv.lock", "flake.lock", "packages.lock.json",
	"*.pb.go", "*_pb2.py", "*.pb.cc", "*.pb.h", "*_gen.go", "*.generated.*",
	"*.g.dart", "*.snap", "*.bundle.js", "*.pack.js",
	"license", "license.*", "licence", "licence.*", "copying", "copying.*", "notice", "notice.*",
	"authors", "contributors", "changelog", "changelog.*",
	"*.po", "*.pot", "*.mo",
	"*.pdf", "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico", "*.webp", "*.woff", "*.woff2",
}

// isDefaultSkipped reports whether a file name matches the built-in exclusions.
func isDefaultSkipped(name string) bool {
	low := strings.ToLower(name)
	for _, p := range defaultSkipFiles {
		if ok, _ := filepath.Match(p, low); ok {
			return true
		}
	}
	return false
}

// hasSkippedDir reports whether any directory component of a slash-separated
// relative path matches the built-in directory exclusions.
func hasSkippedDir(slashPath string) bool {
	if *flagNoDefaultExclude {
		return false
	}
	parts := strings.Split(slashPath, "/")
	for _, p := range parts[:len(parts)-1] {
		if defaultSkipDirs[p] {
			return true
		}
	}
	return false
}

func collectFiles(args []string) ([]string, string, error) {
	var (
		out   []string
		seen  = map[string]bool{}
		modes = map[string]bool{}
	)
	add := func(p string) {
		if seen[p] {
			return
		}
		seen[p] = true
		out = append(out, p)
	}
	for _, a := range args {
		p, err := filepath.Abs(a)
		if err != nil {
			return nil, "", err
		}
		st, err := os.Stat(p)
		if err != nil {
			return nil, "", fmt.Errorf("cannot access %s: %w", a, err)
		}
		if !st.IsDir() {
			add(p)
			modes["file"] = true
			continue
		}
		if !*flagNoGit {
			if list, ok := gitTracked(p); ok {
				for _, f := range list {
					add(f)
				}
				modes["git"] = true
				continue
			}
		}
		for _, f := range walkAll(p) {
			add(f)
		}
		modes["fs"] = true
	}
	mode := "not a git repository: all files processed recursively"
	if modes["git"] {
		mode = "git repository: only tracked files processed"
	}
	if modes["file"] && !modes["git"] && !modes["fs"] {
		mode = "explicit file arguments"
	}
	sort.Strings(out)
	return out, mode, nil
}

// gitTracked returns the absolute paths of the git-tracked files below dir.
func gitTracked(dir string) ([]string, bool) {
	if _, err := exec.LookPath("git"); err != nil {
		return nil, false
	}
	cmd := exec.Command("git", "-C", dir, "rev-parse", "--is-inside-work-tree")
	cmd.Stderr = io.Discard
	o, err := cmd.Output()
	if err != nil || strings.TrimSpace(string(o)) != "true" {
		return nil, false
	}
	cmd = exec.Command("git", "-C", dir, "ls-files", "-z", "--cached", "--", ".")
	cmd.Stderr = io.Discard
	var buf bytes.Buffer
	cmd.Stdout = &buf
	if err := cmd.Run(); err != nil {
		return nil, false
	}
	var res []string
	for _, p := range bytes.Split(buf.Bytes(), []byte{0}) {
		if len(p) == 0 {
			continue
		}
		relp := string(p)
		if hasSkippedDir(relp) {
			continue // vendored / generated trees that happen to be committed
		}
		full := filepath.Join(dir, filepath.FromSlash(relp))
		st, err := os.Stat(full)
		if err != nil || !st.Mode().IsRegular() {
			continue // deleted, submodule or symlink
		}
		res = append(res, full)
	}
	return res, true
}

func walkAll(dir string) []string {
	var res []string
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if d.IsDir() {
			if p != dir && defaultSkipDirs[d.Name()] {
				return fs.SkipDir
			}
			return nil
		}
		if !d.Type().IsRegular() {
			return nil
		}
		res = append(res, p)
		return nil
	})
	return res
}

// ---------------------------------------------------------------------------
// processing
// ---------------------------------------------------------------------------

type result struct {
	path    string
	status  string // "changed" | "same" | "skipped" | "error"
	reason  string
	removed int
	diff    string
	err     error
}

func runAll(files []string, k *keeper) []result {
	results := make([]result, len(files))
	jobs := *flagJobs
	if jobs < 1 {
		jobs = 1
	}
	if jobs > len(files) {
		jobs = len(files)
	}
	idx := make(chan int)
	var wg sync.WaitGroup
	for w := 0; w < jobs; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range idx {
				results[i] = processFile(files[i], k)
			}
		}()
	}
	for i := range files {
		idx <- i
	}
	close(idx)
	wg.Wait()
	return results
}

func processFile(path string, k *keeper) result {
	r := result{path: path}

	base := filepath.Base(path)
	if !*flagNoDefaultExclude && isDefaultSkipped(base) {
		r.status, r.reason = "skipped", "built-in exclusion"
		return r
	}
	if !extAllowed(path) || excluded(path) {
		r.status, r.reason = "skipped", "filter"
		return r
	}
	lang, ok := detectLang(path)
	if !ok {
		r.status, r.reason = "skipped", "unknown file type"
		return r
	}
	st, err := os.Stat(path)
	if err != nil {
		r.status, r.err = "error", err
		return r
	}
	if !st.Mode().IsRegular() {
		r.status, r.reason = "skipped", "not a regular file"
		return r
	}
	if st.Size() > *flagMaxSize {
		r.status, r.reason = "skipped", "file too large"
		return r
	}
	src, err := os.ReadFile(path)
	if err != nil {
		r.status, r.err = "error", err
		return r
	}
	if len(src) == 0 {
		r.status, r.reason = "same", "empty file"
		return r
	}
	if isBinary(src) {
		r.status, r.reason = "skipped", "binary"
		return r
	}
	if !*flagAllowInvalidUTF8 && !utf8.Valid(src) {
		r.status, r.reason = "skipped", "not valid UTF-8"
		return r
	}

	out := lang.scan(src, k)
	if *flagSqueeze {
		out = squeezeBlanks(out)
	}
	if bytes.Equal(out, src) {
		r.status, r.reason = "same", lang.name
		return r
	}
	r.status = "changed"
	r.reason = lang.name
	r.removed = len(src) - len(out)
	if *flagDiff {
		r.diff = unifiedDiff(path, src, out)
	}
	if *flagDry {
		return r
	}
	if *flagBackup {
		if err := os.WriteFile(path+".bak", src, st.Mode().Perm()); err != nil {
			r.status, r.err = "error", err
			return r
		}
	}
	if err := atomicWrite(path, out, st.Mode().Perm()); err != nil {
		r.status, r.err = "error", err
	}
	return r
}

func atomicWrite(path string, data []byte, perm os.FileMode) error {
	dir := filepath.Dir(path)
	tmp, err := os.CreateTemp(dir, ".remove-comments-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	cleanup := true
	defer func() {
		if cleanup {
			_ = os.Remove(name)
		}
	}()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(perm); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(name, path); err != nil {
		return err
	}
	cleanup = false
	return nil
}

func isBinary(data []byte) bool {
	n := len(data)
	if n > 8192 {
		n = 8192
	}
	return bytes.IndexByte(data[:n], 0) >= 0
}

// ---------------------------------------------------------------------------
// filters
// ---------------------------------------------------------------------------

var extAllowList []string

func extAllowed(path string) bool {
	if len(extAllowList) == 0 {
		return true
	}
	e := strings.ToLower(filepath.Ext(path))
	for _, a := range extAllowList {
		if a == e {
			return true
		}
	}
	return false
}

var excludeGlobs []string

func excluded(path string) bool {
	if len(excludeGlobs) == 0 {
		return false
	}
	p := filepath.ToSlash(path)
	base := strings.ToLower(filepath.Base(path))
	for _, g := range excludeGlobs {
		gl := strings.ToLower(g)
		if ok, _ := filepath.Match(gl, base); ok {
			return true
		}
		if ok, _ := filepath.Match(gl, p); ok {
			return true
		}
		if strings.Contains(gl, "/") {
			// allow "vendor/*" to match at any depth
			if ok, _ := filepath.Match("**/"+gl, p); ok {
				return true
			}
		}
		if strings.Contains(p, "/"+strings.TrimSuffix(gl, "/")+"/") {
			return true
		}
	}
	return false
}

func initFilters() {
	if s := strings.TrimSpace(*flagExt); s != "" {
		for _, e := range strings.Split(s, ",") {
			e = strings.ToLower(strings.TrimSpace(e))
			if e == "" {
				continue
			}
			if !strings.HasPrefix(e, ".") {
				e = "." + e
			}
			extAllowList = append(extAllowList, e)
		}
	}
	if s := strings.TrimSpace(*flagExclude); s != "" {
		for _, g := range strings.Split(s, ",") {
			g = strings.TrimSpace(g)
			if g != "" {
				excludeGlobs = append(excludeGlobs, g)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

func report(results []result, mode string, total int) int {
	var changed, same, skipped, failed, removed int
	for _, r := range results {
		switch r.status {
		case "changed":
			changed++
			removed += r.removed
			if *flagDiff && r.diff != "" {
				fmt.Print(r.diff)
			} else if !*flagQuiet {
				tag := ""
				if *flagDry {
					tag = " (dry-run)"
				}
				fmt.Printf("changed %s [-%d bytes]%s\n", rel(r.path), r.removed, tag)
			}
		case "same":
			same++
		case "skipped":
			skipped++
			if *flagVerbose && !*flagQuiet {
				fmt.Printf("skipped %s (%s)\n", rel(r.path), r.reason)
			}
		case "error":
			failed++
			fmt.Fprintf(os.Stderr, "error: %s: %v\n", rel(r.path), r.err)
		}
	}
	if !*flagQuiet {
		verb := "changed"
		if *flagDry {
			verb = "would change"
		}
		fmt.Printf("\nmode: %s\n", mode)
		fmt.Printf("scanned %d files -> %s %d, unchanged %d, skipped %d, failed %d, removed %d bytes\n",
			total, verb, changed, same, skipped, failed, removed)
		if *flagDry && changed > 0 {
			fmt.Println("note: dry run, nothing was written; rerun without -dry/-diff to apply changes.")
		}
	}
	if failed > 0 {
		return 1
	}
	return 0
}

func rel(p string) string {
	wd, err := os.Getwd()
	if err != nil {
		return p
	}
	if r, err := filepath.Rel(wd, p); err == nil && !strings.HasPrefix(r, "..") {
		return r
	}
	return p
}

// ---------------------------------------------------------------------------
// blank-line squeezing
// ---------------------------------------------------------------------------

func squeezeBlanks(src []byte) []byte {
	if !bytes.Contains(src, []byte("\n\n")) {
		return src
	}
	out := make([]byte, 0, len(src))
	i := 0
	blankStreak := 0
	for i < len(src) {
		j := bytes.IndexByte(src[i:], '\n')
		var line []byte
		if j < 0 {
			line = src[i:]
			i = len(src)
		} else {
			line = src[i : i+j+1]
			i += j + 1
		}
		trim := bytes.TrimRight(line, " \t\r\n")
		if len(trim) == 0 {
			blankStreak++
			if blankStreak > 1 {
				continue
			}
		} else {
			blankStreak = 0
		}
		out = append(out, line...)
	}
	return out
}

// ---------------------------------------------------------------------------
// unified diff
// ---------------------------------------------------------------------------

func splitLines(b []byte) []string {
	var lines []string
	start := 0
	for i := 0; i < len(b); i++ {
		if b[i] == '\n' {
			lines = append(lines, string(b[start:i+1]))
			start = i + 1
		}
	}
	if start < len(b) {
		lines = append(lines, string(b[start:]))
	}
	return lines
}

type diffLine struct {
	op   byte // ' ' | '-' | '+'
	text string
}

func unifiedDiff(path string, a, b []byte) string {
	al, bl := splitLines(a), splitLines(b)
	// trim the common prefix / suffix to shrink the LCS table
	pre := 0
	for pre < len(al) && pre < len(bl) && al[pre] == bl[pre] {
		pre++
	}
	suf := 0
	for suf < len(al)-pre && suf < len(bl)-pre && al[len(al)-1-suf] == bl[len(bl)-1-suf] {
		suf++
	}
	am, bm := al[pre:len(al)-suf], bl[pre:len(bl)-suf]

	var ops []byte
	if len(am)*len(bm) <= 4_000_000 {
		ops = lcsOps(am, bm)
	} else {
		ops = bytes.Repeat([]byte{'-'}, len(am))
		ops = append(ops, bytes.Repeat([]byte{'+'}, len(bm))...)
	}

	full := make([]diffLine, 0, len(al)+len(bl))
	for _, l := range al[:pre] {
		full = append(full, diffLine{' ', l})
	}
	ai, bi := 0, 0
	for _, op := range ops {
		switch op {
		case ' ':
			full = append(full, diffLine{' ', am[ai]})
			ai++
			bi++
		case '-':
			full = append(full, diffLine{'-', am[ai]})
			ai++
		case '+':
			full = append(full, diffLine{'+', bm[bi]})
			bi++
		}
	}
	for _, l := range al[len(al)-suf:] {
		full = append(full, diffLine{' ', l})
	}

	var sb strings.Builder
	slash := filepath.ToSlash(rel(path))
	if strings.HasPrefix(slash, "/") {
		fmt.Fprintf(&sb, "--- %s\n+++ %s\n", slash, slash)
	} else {
		fmt.Fprintf(&sb, "--- a/%s\n+++ b/%s\n", slash, slash)
	}
	const ctx = 3
	i := 0
	for i < len(full) {
		if full[i].op == ' ' {
			i++
			continue
		}
		start := i - ctx
		if start < 0 {
			start = 0
		}
		last := i
		j := i
		for j < len(full) {
			if full[j].op != ' ' {
				last = j
				j++
				continue
			}
			s := j
			for j < len(full) && full[j].op == ' ' {
				j++
			}
			if j >= len(full) || j-s > 2*ctx {
				break
			}
		}
		stop := last + ctx + 1
		if stop > len(full) {
			stop = len(full)
		}
		aStart, bStart := 0, 0
		for t := 0; t < start; t++ {
			switch full[t].op {
			case ' ', '-':
				aStart++
			case '+':
				bStart++
			}
		}
		var body strings.Builder
		aCount, bCount := 0, 0
		for t := start; t < stop; t++ {
			l := full[t]
			body.WriteByte(l.op)
			body.WriteString(l.text)
			if !strings.HasSuffix(l.text, "\n") {
				body.WriteByte('\n')
			}
			switch l.op {
			case ' ', '-':
				aCount++
			case '+':
				bCount++
			}
		}
		fmt.Fprintf(&sb, "@@ -%d,%d +%d,%d @@\n", aStart+1, aCount, bStart+1, bCount)
		sb.WriteString(body.String())
		i = stop
	}
	return sb.String()
}

func lcsOps(a, b []string) []byte {
	la, lb := len(a), len(b)
	tab := make([]uint32, (la+1)*(lb+1))
	w := lb + 1
	for i := la - 1; i >= 0; i-- {
		for j := lb - 1; j >= 0; j-- {
			if a[i] == b[j] {
				tab[i*w+j] = tab[(i+1)*w+j+1] + 1
			} else {
				x, y := tab[(i+1)*w+j], tab[i*w+j+1]
				if x >= y {
					tab[i*w+j] = x
				} else {
					tab[i*w+j] = y
				}
			}
		}
	}
	ops := make([]byte, 0, la+lb)
	i, j := 0, 0
	for i < la && j < lb {
		switch {
		case a[i] == b[j]:
			ops = append(ops, ' ')
			i++
			j++
		case tab[(i+1)*w+j] >= tab[i*w+j+1]:
			ops = append(ops, '-')
			i++
		default:
			ops = append(ops, '+')
			j++
		}
	}
	for ; i < la; i++ {
		ops = append(ops, '-')
	}
	for ; j < lb; j++ {
		ops = append(ops, '+')
	}
	return ops
}

// ---------------------------------------------------------------------------
// output buffer
// ---------------------------------------------------------------------------

type outBuf struct {
	b         []byte
	lineStart int // start offset of the current output line
}

func newOut(capacity int) *outBuf {
	return &outBuf{b: make([]byte, 0, capacity+16)}
}

func (o *outBuf) writeByte(c byte) {
	o.b = append(o.b, c)
	if c == '\n' {
		o.lineStart = len(o.b)
	}
}

func (o *outBuf) write(p []byte) {
	if len(p) == 0 {
		return
	}
	o.b = append(o.b, p...)
	if i := bytes.LastIndexByte(p, '\n'); i >= 0 {
		o.lineStart = len(o.b) - (len(p) - 1 - i)
	}
}

func (o *outBuf) reset(n int) {
	if n > len(o.b) {
		n = len(o.b)
	}
	o.b = o.b[:n]
	o.lineStart = bytes.LastIndexByte(o.b, '\n') + 1
}

func (o *outBuf) lastByte() byte {
	if len(o.b) == 0 {
		return 0
	}
	return o.b[len(o.b)-1]
}

// trimTrailingSpace removes trailing spaces/tabs of the current output line.
func (o *outBuf) trimTrailingSpace() {
	for len(o.b) > o.lineStart {
		c := o.b[len(o.b)-1]
		if c == ' ' || c == '\t' {
			o.b = o.b[:len(o.b)-1]
		} else {
			break
		}
	}
}

// lineBlank reports whether the current output line only holds whitespace.
func (o *outBuf) lineBlank() bool {
	for i := o.lineStart; i < len(o.b); i++ {
		switch o.b[i] {
		case ' ', '\t', '\r':
		default:
			return false
		}
	}
	return true
}

func (o *outBuf) prevSignificant() (byte, int) {
	for i := len(o.b) - 1; i >= 0; i-- {
		switch o.b[i] {
		case ' ', '\t', '\n', '\r', '\f', '\v':
			continue
		}
		return o.b[i], i
	}
	return 0, -1
}

func (o *outBuf) prevWord() string {
	c, i := o.prevSignificant()
	if i < 0 || !isWordByte(c) {
		return ""
	}
	j := i
	for j >= 0 && isWordByte(o.b[j]) {
		j--
	}
	return string(o.b[j+1 : i+1])
}

func isWordByte(c byte) bool {
	return c == '_' || c == '$' || (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isAlphaByte(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')
}

func isSpaceByte(c byte) bool {
	switch c {
	case ' ', '\t', '\n', '\r', '\f', '\v':
		return true
	}
	return false
}

// restOfLineBlank reports whether [i,limit) only holds blanks up to a newline.
func restOfLineBlank(src []byte, i, limit int) bool {
	for ; i < limit; i++ {
		switch src[i] {
		case ' ', '\t', '\r':
		case '\n':
			return true
		default:
			return false
		}
	}
	return true
}

// atLineStartWS reports whether everything before i on its line is whitespace.
func atLineStartWS(src []byte, i int) bool {
	for j := i - 1; j >= 0; j-- {
		switch src[j] {
		case ' ', '\t', '\r':
		case '\n':
			return true
		default:
			return false
		}
	}
	return true
}

// needSpace tells whether removing an inline chunk requires inserting a space
// so that the two sides do not merge into a new token.
func needSpace(before, after byte) bool {
	return before != 0 && after != 0 && isWordByte(before) && isWordByte(after)
}

// cutLineComment removes a line comment whose body ends at end (exclusive).
// If the comment occupied a full line, the line itself is dropped.
func cutLineComment(o *outBuf, src []byte, end, limit int) int {
	o.trimTrailingSpace()
	if o.lineBlank() {
		// whole-line comment: drop the line including its newline
		o.reset(o.lineStart)
		if end < limit && src[end] == '\n' {
			end++
		}
		return end
	}
	// trailing comment: do not swallow the '\r' of a CRLF terminator
	if end > 0 && src[end-1] == '\r' {
		end--
	}
	return end
}

// cutBlockComment removes a block comment [.., end). Whole-line comments drop
// their line; inline comments may insert a space to keep tokens apart.
func cutBlockComment(o *outBuf, src []byte, end, limit int) int {
	if o.lineBlank() && restOfLineBlank(src, end, limit) {
		o.reset(o.lineStart)
		j := end
		for j < limit && src[j] != '\n' {
			j++
		}
		if j < limit {
			j++
		}
		return j
	}
	o.trimTrailingSpace()
	before := o.lastByte()
	var after byte
	if end < limit {
		after = src[end]
	}
	if needSpace(before, after) {
		o.writeByte(' ')
	}
	return end
}

// ---------------------------------------------------------------------------
// C-like scanner: Go / JS / TS / JSX / TSX / C / C++ / Java / CSS / SCSS / ...
// ---------------------------------------------------------------------------

type quoteSpec struct {
	delim       byte
	escBS       bool // backslash escapes
	escDouble   bool // doubled delimiter escapes ('' "")
	escBacktick bool // PowerShell backtick escapes
	raw         bool // no escaping at all (Go backticks)
	multiLine   bool // may span lines
	template    bool // JS template literal: ${ } re-enters code mode
	triple      bool // triple-quoted (python, toml, swift, dart, ...)
	luaLong     bool // Lua long string [[ ... ]] / [=[ ... ]=]
	interpBS    bool // Swift-style \( ... ) interpolation
}

type clikeCfg struct {
	lang               string
	line               []string    // line comment markers
	block              [][2]string // block comment delimiters
	quotes             []quoteSpec
	regex              bool     // JS regex literals
	jsx                bool     // JSX/TSX
	cppRaw             bool     // C++ R"delim(...)delim"
	rustRaw            bool     // Rust r#"..."#
	nestedBlock        bool     // block comments may nest (Rust, Swift, Kotlin, ...)
	hashInterp         bool     // SCSS/Less #{ ... } interpolation
	urlSpecial         bool     // protect url(...) contents (SCSS/Less/Sass)
	heredoc            bool     // shell-style <<EOF heredocs
	heredocStripSpaces bool     // <<- terminator may use spaces (HCL)
	luaBlock           bool     // Lua long comments --[=*[ ... ]=*]
	hereStrings        bool     // PowerShell @"..."@ / @'...'@
	perlPOD            bool     // Perl =pod ... =cut blocks
	rawPrefixes        []string // prefixes turning the next quote raw (python r, C# @, dart r)
	lineWordStart      bool     // line marker only valid at the start of a word (shell, yaml, ...)
	lineStartOnly      bool     // line marker only valid on its own line (docker)
}

type clikeScanner struct {
	src []byte
	o   *outBuf
	cfg *clikeCfg
	k   *keeper
}

func stripCLike(src []byte, k *keeper, cfg *clikeCfg) []byte {
	s := &clikeScanner{src: src, o: newOut(len(src)), cfg: cfg, k: k}
	s.scanCode(0, len(src))
	return s.o.b
}

func (s *clikeScanner) scanCode(i, limit int) int {
	for i < limit {
		i = s.stepCode(i, limit)
	}
	return i
}

// stepCode consumes one token at i and returns the next position.
func (s *clikeScanner) stepCode(i, limit int) int {
	src := s.src
	c := src[i]

	// 1) block comments (checked first so ### in CoffeeScript wins over #)
	if s.cfg.luaBlock && c == '-' && i+1 < limit && src[i+1] == '-' {
		if n, ok := s.scanLuaBlock(i, limit); ok {
			return n
		}
	}
	if open, close := s.blockMarkerAt(i, limit); open != "" {
		end, closed := findBlockEnd(src, i+len(open), close, s.cfg.nestedBlock, limit)
		if !closed {
			s.o.write(src[i:limit])
			return limit
		}
		body := string(src[i+len(open) : end-len(close)])
		if s.k.keep(s.cfg.lang, open, body, i == 0 && len(s.o.b) == 0) {
			s.o.write(src[i:end])
			return end
		}
		return cutBlockComment(s.o, src, end, limit)
	}

	// 2) string / character literals (checked before line markers so that a
	//    '#' or '//' inside a string never starts a comment)
	if q, ok := s.quoteAt(i, limit); ok {
		if n, ok2 := s.scanString(i, limit, q); ok2 {
			return n
		}
		s.o.writeByte(c)
		return i + 1
	}

	// 3) line comments
	if m := s.lineMarkerAt(i, limit); m != "" {
		j := i + len(m)
		e := j
		for e < limit && src[e] != '\n' {
			e++
		}
		bodyEnd := e
		if bodyEnd > j && src[bodyEnd-1] == '\r' {
			bodyEnd--
		}
		body := string(src[j:bodyEnd])
		if s.k.keep(s.cfg.lang, m, body, i == 0 && len(s.o.b) == 0) {
			s.o.write(src[i:e])
			return e
		}
		return cutLineComment(s.o, src, e, limit)
	}

	// 4) C++ / Rust raw strings
	if s.cfg.cppRaw && (c == 'R' || c == 'u' || c == 'U' || c == 'L') {
		if n, ok := s.tryCppRaw(i, limit); ok {
			return n
		}
	}
	if s.cfg.rustRaw && (c == 'r' || c == 'b') {
		if n, ok := s.tryRustRaw(i, limit); ok {
			return n
		}
	}

	// 5) PowerShell here-strings
	if s.cfg.hereStrings && c == '@' {
		if n, ok := s.scanHereString(i, limit); ok {
			return n
		}
	}

	// 6) shell-style heredocs
	if s.cfg.heredoc && c == '<' && i+1 < limit && src[i+1] == '<' {
		if n, ok := s.scanHeredoc(i, limit); ok {
			return n
		}
	}

	// 7) SCSS/Less url(...)
	if s.cfg.urlSpecial && (c == 'u' || c == 'U') {
		if n, ok := s.tryURL(i, limit); ok {
			return n
		}
	}

	// 8) Perl POD blocks
	if s.cfg.perlPOD && src[i] == '=' && (i == 0 || src[i-1] == '\n') && i+1 < limit && isAlphaByte(src[i+1]) {
		if n, ok := s.scanPOD(i, limit); ok {
			return n
		}
	}

	// 9) SCSS/Less interpolation #{ ... }
	if s.cfg.hashInterp && c == '#' && i+1 < limit && src[i+1] == '{' {
		s.o.writeByte('#')
		if n, ok := s.scanBraceExpr(i+1, limit); ok {
			return n
		}
		return i + 1
	}

	// 10) JS regex literals
	if s.cfg.regex && c == '/' && s.regexAllowed() {
		if n, ok := s.scanRegex(i, limit); ok {
			return n
		}
	}

	// 11) JSX
	if s.cfg.jsx && c == '<' && s.jsxAllowed() {
		if n, ok := s.scanJSX(i, limit); ok {
			return n
		}
	}

	s.o.writeByte(c)
	return i + 1
}

func (s *clikeScanner) lineMarkerAt(i, limit int) string {
	for _, m := range s.cfg.line {
		if i+len(m) > limit || string(s.src[i:i+len(m)]) != m {
			continue
		}
		if s.cfg.lineWordStart && !(i == 0 || isSpaceByte(s.src[i-1])) {
			continue
		}
		if s.cfg.lineStartOnly && !atLineStartWS(s.src, i) {
			continue
		}
		return m
	}
	return ""
}

func (s *clikeScanner) blockMarkerAt(i, limit int) (string, string) {
	for _, p := range s.cfg.block {
		if i+len(p[0]) <= limit && string(s.src[i:i+len(p[0])]) == p[0] {
			return p[0], p[1]
		}
	}
	return "", ""
}

// findBlockEnd returns the end of a block comment (after the closing marker).
func findBlockEnd(src []byte, from int, close string, nested bool, limit int) (int, bool) {
	depth := 1
	open := ""
	if nested {
		open = blockOpenFor(close)
	}
	i := from
	for i < limit {
		if nested && open != "" && i+len(open) <= limit && string(src[i:i+len(open)]) == open {
			depth++
			i += len(open)
			continue
		}
		if i+len(close) <= limit && string(src[i:i+len(close)]) == close {
			depth--
			i += len(close)
			if depth == 0 {
				return i, true
			}
			continue
		}
		i++
	}
	return limit, false
}

func blockOpenFor(close string) string {
	switch close {
	case "*/":
		return "/*"
	case "-}":
		return "{-"
	case "*)":
		return "(*"
	case "|#":
		return "#|"
	case "=#":
		return "#="
	}
	return ""
}

func (s *clikeScanner) quoteAt(i, limit int) (quoteSpec, bool) {
	src := s.src
	for _, q := range s.cfg.quotes {
		if src[i] != q.delim {
			continue
		}
		if q.triple {
			if i+2 < limit && src[i+1] == q.delim && src[i+2] == q.delim {
				return q, true
			}
			continue
		}
		if q.luaLong {
			return q, true // validated inside scanString
		}
		// raw-string prefixes (python r"...", C# @"...", dart r'...')
		for _, p := range s.cfg.rawPrefixes {
			pl := len(p)
			if i-pl >= 0 && string(src[i-pl:i]) == p {
				if i-pl-1 < 0 || !isWordByte(src[i-pl-1]) {
					r := q
					r.escBS = false
					r.raw = true
					return r, true
				}
			}
		}
		return q, true
	}
	return quoteSpec{}, false
}

// scanString copies a string literal verbatim into the output. On failure it
// rolls the output back and returns false so the caller can treat the
// delimiter as an ordinary character.
func (s *clikeScanner) scanString(start, limit int, q quoteSpec) (int, bool) {
	src := s.src
	d := q.delim
	mark := len(s.o.b)
	i := start

	if q.luaLong {
		j := start + 1
		eq := 0
		for j < limit && src[j] == '=' {
			eq++
			j++
		}
		if j >= limit || src[j] != '[' {
			return start, false
		}
		term := []byte("]" + strings.Repeat("=", eq) + "]")
		e := bytes.Index(src[j+1:limit], term)
		if e < 0 {
			return start, false
		}
		end := j + 1 + e + len(term)
		s.o.write(src[start:end])
		return end, true
	}

	triple := q.triple
	if triple {
		s.o.write(src[i : i+3])
		i += 3
	} else {
		s.o.writeByte(d)
		i++
	}
	for i < limit {
		c := src[i]
		// Swift-style interpolation \( ... )
		if q.interpBS && c == '\\' && i+1 < limit && src[i+1] == '(' {
			s.o.write(src[i : i+2])
			n, ok := s.scanParenExpr(i+1, limit)
			if !ok {
				s.o.reset(mark)
				return start, false
			}
			i = n
			continue
		}
		if q.escBS && c == '\\' {
			if i+1 < limit {
				s.o.write(src[i : i+2])
				i += 2
			} else {
				s.o.writeByte(c)
				i++
			}
			continue
		}
		if q.escBacktick && c == '`' {
			if i+1 < limit {
				s.o.write(src[i : i+2])
				i += 2
			} else {
				s.o.writeByte(c)
				i++
			}
			continue
		}
		if triple {
			if c == d {
				cnt := 0
				for i+cnt < limit && src[i+cnt] == d {
					cnt++
				}
				if cnt >= 3 {
					s.o.write(src[i : i+3])
					return i + 3, true
				}
				s.o.write(src[i : i+cnt])
				i += cnt
				continue
			}
			if c == '\n' && !q.multiLine {
				s.o.reset(mark)
				return start, false
			}
			s.o.writeByte(c)
			i++
			continue
		}
		if q.escDouble && c == d && i+1 < limit && src[i+1] == d {
			s.o.write(src[i : i+2])
			i += 2
			continue
		}
		if c == d {
			s.o.writeByte(d)
			return i + 1, true
		}
		if c == '\n' && !q.multiLine {
			s.o.reset(mark)
			return start, false
		}
		if q.template && c == '$' && i+1 < limit && src[i+1] == '{' {
			s.o.writeByte('$')
			n, ok := s.scanBraceExpr(i+1, limit)
			if !ok {
				s.o.reset(mark)
				return start, false
			}
			i = n
			continue
		}
		s.o.writeByte(c)
		i++
	}
	s.o.reset(mark)
	return start, false
}

// scanBraceExpr scans { ... } as code (comments inside are stripped). src[i] == '{'.
func (s *clikeScanner) scanBraceExpr(i, limit int) (int, bool) {
	mark := len(s.o.b)
	s.o.writeByte('{')
	j := i + 1
	depth := 1
	for j < limit {
		c := s.src[j]
		if c == '{' {
			depth++
			s.o.writeByte(c)
			j++
			continue
		}
		if c == '}' {
			depth--
			s.o.writeByte(c)
			j++
			if depth == 0 {
				return j, true
			}
			continue
		}
		j = s.stepCode(j, limit)
	}
	s.o.reset(mark)
	return 0, false
}

// scanParenExpr scans ( ... ) as code. src[i] == '('.
func (s *clikeScanner) scanParenExpr(i, limit int) (int, bool) {
	mark := len(s.o.b)
	s.o.writeByte('(')
	j := i + 1
	depth := 1
	for j < limit {
		c := s.src[j]
		if c == '(' {
			depth++
			s.o.writeByte(c)
			j++
			continue
		}
		if c == ')' {
			depth--
			s.o.writeByte(c)
			j++
			if depth == 0 {
				return j, true
			}
			continue
		}
		j = s.stepCode(j, limit)
	}
	s.o.reset(mark)
	return 0, false
}

func (s *clikeScanner) scanRegex(i, limit int) (int, bool) {
	src := s.src
	j := i + 1
	inClass := false
	for j < limit {
		c := src[j]
		if c == '\n' {
			return 0, false
		}
		if c == '\\' {
			j += 2
			continue
		}
		switch {
		case c == '[':
			inClass = true
		case c == ']':
			inClass = false
		case c == '/' && !inClass:
			j++
			for j < limit && isAlphaByte(src[j]) {
				j++
			}
			s.o.write(src[i:j])
			return j, true
		}
		j++
	}
	return 0, false
}

var regexKeywords = map[string]bool{
	"return": true, "typeof": true, "instanceof": true, "in": true, "of": true,
	"new": true, "delete": true, "void": true, "throw": true, "do": true,
	"else": true, "yield": true, "await": true, "case": true, "default": true,
	"extends": true, "if": true, "while": true, "for": true, "switch": true,
	"catch": true, "with": true, "try": true, "finally": true,
}

func (s *clikeScanner) regexAllowed() bool {
	c, i := s.o.prevSignificant()
	if i < 0 {
		return true
	}
	if isWordByte(c) {
		return regexKeywords[s.o.prevWord()]
	}
	switch c {
	case ')', ']', '"', '\'', '`':
		return false
	case '+', '-':
		if i > 0 && s.o.b[i-1] == c {
			return false // ++ / --
		}
		return true
	}
	return true
}

func (s *clikeScanner) jsxAllowed() bool {
	c, i := s.o.prevSignificant()
	if i < 0 {
		return true
	}
	if isWordByte(c) {
		return regexKeywords[s.o.prevWord()]
	}
	switch c {
	case ')', ']', '"', '\'', '`':
		return false
	}
	return true
}

func (s *clikeScanner) tryCppRaw(i, limit int) (int, bool) {
	src := s.src
	if i > 0 && isWordByte(src[i-1]) {
		return 0, false
	}
	j := i
	for _, p := range []string{"u8", "u", "U", "L"} {
		if j+len(p)+1 < limit && string(src[j:j+len(p)]) == p && src[j+len(p)] == 'R' && src[j+len(p)+1] == '"' {
			j += len(p)
			break
		}
	}
	if j+1 >= limit || src[j] != 'R' || src[j+1] != '"' {
		return 0, false
	}
	k := j + 2
	ds := k
	for k < limit && k-ds < 16 {
		c := src[k]
		if c == '(' {
			break
		}
		if c == '"' || c == ')' || c == ' ' || c == '\t' || c == '\n' || c == '\\' {
			return 0, false
		}
		k++
	}
	if k >= limit || src[k] != '(' {
		return 0, false
	}
	term := []byte(")" + string(src[ds:k]) + "\"")
	e := bytes.Index(src[k+1:limit], term)
	if e < 0 {
		return 0, false
	}
	end := k + 1 + e + len(term)
	s.o.write(src[i:end])
	return end, true
}

func (s *clikeScanner) tryRustRaw(i, limit int) (int, bool) {
	src := s.src
	if i > 0 && isWordByte(src[i-1]) {
		return 0, false
	}
	j := i
	if src[j] == 'b' {
		j++
	}
	if j >= limit || src[j] != 'r' {
		return 0, false
	}
	j++
	h := 0
	for j < limit && src[j] == '#' {
		h++
		j++
	}
	if j >= limit || src[j] != '"' {
		return 0, false
	}
	term := []byte(`"` + strings.Repeat("#", h))
	e := bytes.Index(src[j+1:limit], term)
	if e < 0 {
		return 0, false
	}
	end := j + 1 + e + len(term)
	s.o.write(src[i:end])
	return end, true
}

// scanHereString handles PowerShell here-strings: @"..."@ and @'...'@.
// The opening @ must not be glued to a word and only whitespace may follow
// the quote on that line; the terminator sits at the start of its own line.
func (s *clikeScanner) scanHereString(i, limit int) (int, bool) {
	src := s.src
	if i+1 >= limit || (src[i+1] != '"' && src[i+1] != '\'') {
		return 0, false
	}
	if i > 0 && isWordByte(src[i-1]) {
		return 0, false
	}
	d := src[i+1]
	j := i + 2
	for j < limit && (src[j] == ' ' || src[j] == '\t') {
		j++
	}
	if j >= limit || src[j] != '\n' {
		if j >= limit || src[j] != '\r' || j+1 >= limit || src[j+1] != '\n' {
			return 0, false
		}
	}
	term := []byte("\n" + string(d) + "@")
	e := bytes.Index(src[j:limit], term)
	if e < 0 {
		return 0, false
	}
	end := j + e + len(term)
	s.o.write(src[i:end])
	return end, true
}

// scanLuaBlock handles Lua long comments --[=*[ ... ]=*] at any level.
// A malformed long bracket falls back to the plain -- line comment.
func (s *clikeScanner) scanLuaBlock(i, limit int) (int, bool) {
	src := s.src
	j := i + 2
	if j >= limit || src[j] != '[' {
		return 0, false
	}
	eq := 0
	k := j + 1
	for k < limit && src[k] == '=' {
		eq++
		k++
	}
	if k >= limit || src[k] != '[' {
		return 0, false
	}
	term := []byte("]" + strings.Repeat("=", eq) + "]")
	e := bytes.Index(src[k+1:limit], term)
	if e < 0 {
		return 0, false
	}
	end := k + 1 + e + len(term)
	body := string(src[k+1 : k+1+e])
	if s.k.keep(s.cfg.lang, "--[", body, i == 0 && len(s.o.b) == 0) {
		s.o.write(src[i:end])
		return end, true
	}
	return cutBlockComment(s.o, src, end, limit), true
}

// scanHeredoc handles shell-style heredocs: <<EOF, <<-EOF, <<"EOF", ...
func (s *clikeScanner) scanHeredoc(i, limit int) (int, bool) {
	src := s.src
	if i+2 < limit && src[i+2] == '<' {
		return 0, false // <<< here-string, not a heredoc
	}
	j := i + 2
	strip := false
	if j < limit && (src[j] == '-' || src[j] == '~') {
		strip = src[j] == '-'
		j++
	}
	for j < limit && (src[j] == ' ' || src[j] == '\t') {
		j++
	}
	var dq byte
	if j < limit && (src[j] == '\'' || src[j] == '"' || src[j] == '`') {
		dq = src[j]
		j++
	}
	s0 := j
	for j < limit && (isWordByte(src[j]) || src[j] == '-' || src[j] == '.') {
		j++
	}
	if j == s0 {
		return 0, false
	}
	delim := string(src[s0:j])
	if dq != 0 {
		if j >= limit || src[j] != dq {
			return 0, false
		}
		j++
	}
	eol := j
	for eol < limit && src[eol] != '\n' {
		eol++
	}
	if eol < limit {
		eol++
	}
	k := eol
	for k < limit {
		ls := k
		for k < limit && src[k] != '\n' {
			k++
		}
		t := src[ls:k]
		if strip {
			if s.cfg.heredocStripSpaces {
				t = bytes.TrimLeft(t, " \t")
			} else {
				t = bytes.TrimLeft(t, "\t")
			}
		}
		if string(bytes.TrimRight(t, "\r")) == delim {
			end := k
			if end < limit {
				end++
			}
			s.o.write(src[i:end])
			return end, true
		}
		if k < limit {
			k++
		} else {
			break
		}
	}
	return 0, false
}

// tryURL protects url(...) in SCSS/Less/Sass so that http:// inside is kept.
func (s *clikeScanner) tryURL(i, limit int) (int, bool) {
	src := s.src
	if !hasPrefixFold(src[i:], "url") {
		return 0, false
	}
	if i > 0 && isWordByte(src[i-1]) {
		return 0, false
	}
	j := i + 3
	for j < limit && (src[j] == ' ' || src[j] == '\t') {
		j++
	}
	if j >= limit || src[j] != '(' {
		return 0, false
	}
	depth := 0
	k := j
	for k < limit {
		c := src[k]
		if c == '\n' {
			return 0, false
		}
		if c == '\'' || c == '"' {
			d := c
			k++
			for k < limit && src[k] != d {
				if src[k] == '\\' {
					k++
				}
				k++
			}
			if k >= limit {
				return 0, false
			}
			k++
			continue
		}
		if c == '(' {
			depth++
		}
		if c == ')' {
			depth--
			if depth == 0 {
				k++
				s.o.write(src[i:k])
				return k, true
			}
		}
		k++
	}
	return 0, false
}

var podCmds = map[string]bool{
	"pod": true, "head1": true, "head2": true, "head3": true, "head4": true,
	"over": true, "item": true, "back": true, "begin": true, "end": true,
	"for": true, "encoding": true,
}

// scanPOD strips Perl POD blocks (=pod ... =cut) when unterminated blocks are
// absent; an unterminated block is left untouched to avoid data loss.
func (s *clikeScanner) scanPOD(i, limit int) (int, bool) {
	src := s.src
	j := i + 1
	for j < limit && isWordByte(src[j]) {
		j++
	}
	if !podCmds[string(src[i+1:j])] {
		return 0, false
	}
	k := j
	for k < limit {
		p := bytes.Index(src[k:limit], []byte("\n=cut"))
		if p < 0 {
			return 0, false
		}
		e := k + p + 1 + 4 // position right after "=cut"
		if e < limit && isWordByte(src[e]) {
			k = e
			continue
		}
		for e < limit && src[e] != '\n' {
			e++
		}
		if e < limit {
			e++
		}
		body := string(src[i:e])
		if s.k.keep(s.cfg.lang, "=pod", body, i == 0 && len(s.o.b) == 0) {
			s.o.write(src[i:e])
		}
		return e, true
	}
	return 0, false
}

// ----------------------------- JSX -----------------------------------------

func isJSXSpace(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\r' }

func isJSXNameStart(c byte) bool {
	return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_' || c == '$'
}

func isJSXNameChar(c byte) bool {
	return isJSXNameStart(c) || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == ':'
}

func (s *clikeScanner) scanJSX(start, limit int) (int, bool) {
	mark := len(s.o.b)
	n, ok := s.jsxElement(start, limit)
	if !ok {
		s.o.reset(mark)
		return 0, false
	}
	return n, true
}

func (s *clikeScanner) jsxElement(i, limit int) (int, bool) {
	src := s.src
	if i >= limit || src[i] != '<' {
		return 0, false
	}
	j := i + 1
	if j < limit && src[j] == '>' { // fragment <>...</>
		s.o.write(src[i : j+1])
		return s.jsxChildren(j+1, limit, "")
	}
	if j >= limit || !isJSXNameStart(src[j]) {
		return 0, false
	}
	ns := j
	for j < limit && isJSXNameChar(src[j]) {
		j++
	}
	name := string(src[ns:j])
	s.o.write(src[i:j])

	for { // attributes
		ws := j
		for j < limit && isJSXSpace(src[j]) {
			j++
		}
		if j >= limit {
			return 0, false
		}
		c := src[j]
		if c == '/' && j+1 < limit && src[j+1] == '>' {
			s.o.write(src[ws : j+2])
			return j + 2, true
		}
		if c == '>' {
			s.o.write(src[ws : j+1])
			j++
			break
		}
		if c == '{' {
			s.o.write(src[ws:j])
			n, ok := s.jsxBrace(j, limit)
			if !ok {
				return 0, false
			}
			j = n
			continue
		}
		if !isJSXNameStart(c) {
			return 0, false
		}
		for j < limit && isJSXNameChar(src[j]) {
			j++
		}
		k := j
		for k < limit && isJSXSpace(src[k]) {
			k++
		}
		if k < limit && src[k] == '=' {
			k++
			for k < limit && isJSXSpace(src[k]) {
				k++
			}
			if k >= limit {
				return 0, false
			}
			if src[k] == '"' || src[k] == '\'' {
				d := src[k]
				k++
				for k < limit && src[k] != d {
					if src[k] == '\n' {
						return 0, false
					}
					k++
				}
				if k >= limit {
					return 0, false
				}
				k++
				s.o.write(src[ws:k])
				j = k
			} else if src[k] == '{' {
				s.o.write(src[ws:k])
				n, ok := s.jsxBrace(k, limit)
				if !ok {
					return 0, false
				}
				j = n
			} else {
				return 0, false
			}
		} else {
			s.o.write(src[ws:j])
		}
	}
	return s.jsxChildren(j, limit, name)
}

func (s *clikeScanner) jsxChildren(j, limit int, name string) (int, bool) {
	src := s.src
	for {
		if j >= limit {
			return 0, false
		}
		c := src[j]
		if c == '<' {
			if j+1 < limit && src[j+1] == '/' {
				k := j + 2
				if name == "" {
					for k < limit && isJSXSpace(src[k]) {
						k++
					}
					if k < limit && src[k] == '>' {
						s.o.write(src[j : k+1])
						return k + 1, true
					}
					return 0, false
				}
				cs := k
				for k < limit && isJSXNameChar(src[k]) {
					k++
				}
				if string(src[cs:k]) != name {
					return 0, false
				}
				for k < limit && isJSXSpace(src[k]) {
					k++
				}
				if k >= limit || src[k] != '>' {
					return 0, false
				}
				s.o.write(src[j : k+1])
				return k + 1, true
			}
			n, ok := s.jsxElement(j, limit)
			if !ok {
				return 0, false
			}
			j = n
			continue
		}
		if c == '{' {
			mark := len(s.o.b)
			n, ok := s.jsxBrace(j, limit)
			if !ok {
				return 0, false
			}
			// drop the empty braces left behind by {/* comment */}
			if isBlankBraces(s.o.b[mark:]) {
				s.o.reset(mark)
				s.o.trimTrailingSpace()
			}
			j = n
			continue
		}
		// JSX text: kept verbatim ("//" here is not a comment)
		s.o.writeByte(c)
		j++
	}
}

func (s *clikeScanner) jsxBrace(i, limit int) (int, bool) {
	return s.scanBraceExpr(i, limit)
}

// isBlankBraces reports whether b is exactly "{" + whitespace + "}".
func isBlankBraces(b []byte) bool {
	if len(b) < 2 || b[0] != '{' || b[len(b)-1] != '}' {
		return false
	}
	for _, c := range b[1 : len(b)-1] {
		if !isSpaceByte(c) {
			return false
		}
	}
	return true
}

// ---------------------------------------------------------------------------
// markup scanner: templates with distinctive comment delimiters
// ---------------------------------------------------------------------------

func stripMarkup(src []byte, k *keeper, lang string, pairs [][2]string) []byte {
	o := newOut(len(src))
	i, n := 0, len(src)
	for i < n {
		matched := false
		for _, p := range pairs {
			op := p[0]
			if i+len(op) > n || string(src[i:i+len(op)]) != op {
				continue
			}
			end, closed := findBlockEnd(src, i+len(op), p[1], false, n)
			if !closed {
				o.write(src[i:n])
				return o.b
			}
			body := string(src[i+len(op) : end-len(p[1])])
			if k.keep(lang, op, body, i == 0 && len(o.b) == 0) {
				o.write(src[i:end])
				i = end
			} else {
				i = cutBlockComment(o, src, end, n)
			}
			matched = true
			break
		}
		if !matched {
			o.writeByte(src[i])
			i++
		}
	}
	return o.b
}

// ---------------------------------------------------------------------------
// HTML scanner (also used for XML, Vue, Svelte, Astro)
// ---------------------------------------------------------------------------

func stripHTML(src []byte, k *keeper, delegate bool) []byte {
	o := newOut(len(src))
	i, n := 0, len(src)
	for i < n {
		if i+4 <= n && string(src[i:i+4]) == "<!--" {
			end, closed := findBlockEnd(src, i+4, "-->", false, n)
			if !closed {
				o.write(src[i:n])
				return o.b
			}
			body := string(src[i+4 : end-3])
			if k.keep("html", "<!--", body, i == 0 && len(o.b) == 0) {
				o.write(src[i:end])
				i = end
				continue
			}
			i = cutBlockComment(o, src, end, n)
			continue
		}
		if delegate && src[i] == '<' {
			if next, ok := htmlDelegate(o, src, i, n, k); ok {
				i = next
				continue
			}
		}
		o.writeByte(src[i])
		i++
	}
	return o.b
}

// htmlDelegate processes an embedded <script>/<style> block with the matching
// code scanner. It reports ok when src[i:] really starts such a tag.
func htmlDelegate(o *outBuf, src []byte, i, n int, k *keeper) (int, bool) {
	var tag string
	switch {
	case hasPrefixFold(src[i:], "<script"):
		tag = "script"
	case hasPrefixFold(src[i:], "<style"):
		tag = "style"
	default:
		return i, false
	}
	nxt := i + len(tag) + 1
	if nxt >= n {
		return i, false
	}
	switch src[nxt] {
	case '>', ' ', '\t', '\r', '\n', '/':
	default:
		return i, false
	}
	// find the end of the opening tag, honoring quoted attribute values
	j := nxt
	for j < n && src[j] != '>' {
		if src[j] == '"' || src[j] == '\'' {
			d := src[j]
			j++
			for j < n && src[j] != d {
				j++
			}
			if j >= n {
				return i, false
			}
		}
		j++
	}
	if j >= n {
		return i, false
	}
	openEnd := j + 1
	attrs := src[i+len(tag)+1 : j]
	closeIdx := indexFold(src, "</"+tag, openEnd)
	innerEnd, after := n, n
	if closeIdx >= 0 {
		innerEnd = closeIdx
		ce := closeIdx
		for ce < n && src[ce] != '>' {
			ce++
		}
		if ce < n {
			ce++
		}
		after = ce
	}
	if cfg, ok := embeddedCfg(tag, attrs); ok && len(bytes.TrimSpace(src[openEnd:innerEnd])) > 0 {
		stripped := stripCLike(src[openEnd:innerEnd], k, cfg)
		o.write(src[i:openEnd])
		o.write(stripped)
		o.write(src[innerEnd:after])
		return after, true
	}
	o.write(src[i:after])
	return after, true
}

// embeddedCfg picks the scanner config for an embedded block; ok is false when
// the block holds data instead of code (type="application/json", templates...).
func embeddedCfg(tag string, attrs []byte) (*clikeCfg, bool) {
	typ := ""
	if v, ok := attrValue(attrs, "type"); ok {
		typ = strings.ToLower(v)
	}
	langAttr := ""
	if v, ok := attrValue(attrs, "lang"); ok {
		langAttr = strings.ToLower(v)
	}
	if tag == "style" {
		switch {
		case strings.Contains(langAttr, "scss") || strings.Contains(typ, "scss"):
			return cfgSCSS, true
		case strings.Contains(langAttr, "less") || strings.Contains(typ, "less"):
			return cfgLess, true
		case langAttr == "" && (typ == "" || strings.Contains(typ, "css")):
			return cfgCSS, true
		}
		return nil, false
	}
	switch {
	case strings.Contains(langAttr, "ts") || strings.Contains(typ, "typescript"):
		return cfgTS, true
	case strings.Contains(langAttr, "jsx") || strings.Contains(typ, "jsx"):
		return cfgJSX, true
	case langAttr == "" && (typ == "" || typ == "module" ||
		strings.Contains(typ, "javascript") || strings.Contains(typ, "ecmascript") ||
		strings.Contains(typ, "babel")):
		return cfgJS, true
	}
	return nil, false
}

func attrValue(tag []byte, name string) (string, bool) {
	low := bytes.ToLower(tag)
	needle := []byte(strings.ToLower(name))
	idx := 0
	for {
		p := bytes.Index(low[idx:], needle)
		if p < 0 {
			return "", false
		}
		p += idx
		idx = p + 1
		if p > 0 {
			switch c := tag[p-1]; c {
			case ' ', '\t', '\n', '\r', '"', '\'':
			default:
				continue
			}
		}
		q := p + len(needle)
		if q < len(tag) && (isWordByte(tag[q]) || tag[q] == '-') {
			continue
		}
		for q < len(tag) && (tag[q] == ' ' || tag[q] == '\t' || tag[q] == '\n' || tag[q] == '\r') {
			q++
		}
		if q >= len(tag) || tag[q] != '=' {
			continue
		}
		q++
		for q < len(tag) && (tag[q] == ' ' || tag[q] == '\t') {
			q++
		}
		if q >= len(tag) {
			return "", false
		}
		if tag[q] == '"' || tag[q] == '\'' {
			d := tag[q]
			q++
			s0 := q
			for q < len(tag) && tag[q] != d {
				q++
			}
			return string(tag[s0:q]), true
		}
		s0 := q
		for q < len(tag) && tag[q] != ' ' && tag[q] != '\t' && tag[q] != '>' {
			q++
		}
		return string(tag[s0:q]), true
	}
}

func hasPrefixFold(b []byte, prefix string) bool {
	if len(b) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		c := b[i]
		if c >= 'A' && c <= 'Z' {
			c += 'a' - 'A'
		}
		if c != prefix[i] {
			return false
		}
	}
	return true
}

func indexFold(b []byte, needle string, from int) int {
	if from < 0 {
		from = 0
	}
	if from >= len(b) {
		return -1
	}
	p := bytes.Index(bytes.ToLower(b[from:]), []byte(strings.ToLower(needle)))
	if p < 0 {
		return -1
	}
	return from + p
}

// ---------------------------------------------------------------------------
// markdown / MDX scanner
// ---------------------------------------------------------------------------

type ivl struct{ a, b int }

// mdFenceIntervals returns the byte ranges covered by fenced code blocks.
func mdFenceIntervals(src []byte) []ivl {
	var res []ivl
	i, n := 0, len(src)
	inFence := false
	var fch byte
	flen, start := 0, 0
	for i < n {
		eol := i
		for eol < n && src[eol] != '\n' {
			eol++
		}
		next := eol
		if next < n {
			next++
		}
		line := src[i:eol]
		indent := 0
		for indent < len(line) && line[indent] == ' ' {
			indent++
		}
		if indent <= 3 {
			t := line[indent:]
			if !inFence && len(t) >= 3 && (t[0] == '`' || t[0] == '~') {
				ch := t[0]
				l := 0
				for l < len(t) && t[l] == ch {
					l++
				}
				if l >= 3 {
					inFence, fch, flen, start = true, ch, l, i
				}
			} else if inFence && len(t) >= flen && t[0] == fch {
				l := 0
				for l < len(t) && t[l] == fch {
					l++
				}
				restWS := true
				for _, c := range t[l:] {
					if c != ' ' && c != '\t' && c != '\r' {
						restWS = false
						break
					}
				}
				if l >= flen && restWS {
					res = append(res, ivl{start, next})
					inFence = false
				}
			}
		}
		i = next
	}
	if inFence {
		res = append(res, ivl{start, n})
	}
	return res
}

// stripMarkdown removes HTML comments (and, for MDX, {/* ... */} expression
// comments) while leaving fenced code blocks untouched.
func stripMarkdown(src []byte, k *keeper, mdx bool) []byte {
	prot := mdFenceIntervals(src)
	o := newOut(len(src))
	i, n, pi := 0, len(src), 0
	for i < n {
		if pi < len(prot) && i >= prot[pi].a && i < prot[pi].b {
			o.write(src[i:prot[pi].b])
			i = prot[pi].b
			pi++
			continue
		}
		if pi < len(prot) && i >= prot[pi].b {
			pi++
			continue
		}
		if i+4 <= n && string(src[i:i+4]) == "<!--" {
			end, closed := findBlockEnd(src, i+4, "-->", false, n)
			if !closed {
				o.write(src[i:n])
				break
			}
			body := string(src[i+4 : end-3])
			if k.keep("markdown", "<!--", body, i == 0 && len(o.b) == 0) {
				o.write(src[i:end])
				i = end
				continue
			}
			i = cutBlockComment(o, src, end, n)
			continue
		}
		if mdx && i+3 <= n && string(src[i:i+3]) == "{/*" {
			end, closed := findBlockEnd(src, i+3, "*/}", false, n)
			if !closed {
				o.write(src[i:n])
				break
			}
			body := string(src[i+3 : end-3])
			if k.keep("mdx", "{/*", body, i == 0 && len(o.b) == 0) {
				o.write(src[i:end])
				i = end
				continue
			}
			i = cutBlockComment(o, src, end, n)
			continue
		}
		o.writeByte(src[i])
		i++
	}
	return o.b
}

// ---------------------------------------------------------------------------
// PHP scanner: only strips inside <?php ... ?> / <?= ... ?> segments
// ---------------------------------------------------------------------------

func stripPHP(src []byte, k *keeper) []byte {
	if !bytes.Contains(src, []byte("<?")) {
		return src
	}
	o := newOut(len(src))
	i, n := 0, len(src)
	for i < n {
		j := findPHPOpen(src, i, n)
		if j < 0 {
			o.write(src[i:n])
			break
		}
		o.write(src[i:j])
		tagLen := 2
		if hasPrefixFold(src[j:], "<?php") {
			tagLen = 5
		}
		o.write(src[j : j+tagLen])
		segStart := j + tagLen
		closeIdx := indexFold(src, "?>", segStart)
		segEnd := n
		if closeIdx >= 0 {
			segEnd = closeIdx
		}
		o.write(stripCLike(src[segStart:segEnd], k, cfgPHP))
		i = segEnd
	}
	return o.b
}

// findPHPOpen locates the next PHP open tag, ignoring XML declarations.
func findPHPOpen(src []byte, from, n int) int {
	for i := from; i < n; i++ {
		if src[i] != '<' || i+1 >= n || src[i+1] != '?' {
			continue
		}
		if hasPrefixFold(src[i:], "<?php") {
			return i
		}
		if i+2 < n && src[i+2] == '=' {
			return i
		}
	}
	return -1
}

// ---------------------------------------------------------------------------
// make scanner
// ---------------------------------------------------------------------------

func stripMake(src []byte, k *keeper) []byte {
	o := newOut(len(src))
	i, n := 0, len(src)
	hd := ""
	hdStrip := false
	for i < n {
		eol := i
		for eol < n && src[eol] != '\n' {
			eol++
		}
		line := src[i:eol]
		next := eol
		if next < n {
			next++
		}
		// inside a heredoc started by a previous recipe line: keep verbatim
		if hd != "" {
			t := line
			if hdStrip {
				t = bytes.TrimLeft(t, "\t")
			}
			if string(bytes.TrimRight(t, "\r")) == hd {
				hd = ""
			}
			o.write(src[i:next])
			i = next
			continue
		}
		recipe := len(line) > 0 && line[0] == '\t'
		cut := -1
		if recipe {
			if d, st, ok := findHeredoc(line); ok {
				hd, hdStrip = d, st
				o.write(src[i:next])
				i = next
				continue
			}
			cut = shellHashIndex(line)
		} else {
			cut = makeHashIndex(line)
		}
		if cut < 0 {
			o.write(src[i:next])
			i = next
			continue
		}
		body := strings.TrimRight(string(line[cut+1:]), "\r")
		if k.keep("make", "#", body, i == 0 && len(o.b) == 0) {
			o.write(src[i:next])
			i = next
			continue
		}
		head := bytes.TrimRight(line[:cut], " \t")
		if len(head) == 0 {
			i = next // whole-line comment: drop it entirely
			continue
		}
		o.write(head)
		if len(line) > 0 && line[len(line)-1] == '\r' {
			o.writeByte('\r')
		}
		o.writeByte('\n')
		i = next
	}
	return o.b
}

// makeHashIndex finds the comment start in a makefile line: '#' anywhere
// unless escaped as '\#'.
func makeHashIndex(line []byte) int {
	for j := 0; j < len(line); j++ {
		if line[j] != '#' {
			continue
		}
		if j > 0 && line[j-1] == '\\' {
			continue
		}
		return j
	}
	return -1
}

// shellHashIndex finds a '#' that starts a comment in shell-like text: at the
// start of a word and outside quotes.
func shellHashIndex(line []byte) int {
	var q byte
	for j := 0; j < len(line); j++ {
		c := line[j]
		if q != 0 {
			if q != '\'' && c == '\\' && j+1 < len(line) {
				j++
				continue
			}
			if c == q {
				q = 0
			}
			continue
		}
		switch c {
		case '\'', '"':
			q = c
		case '#':
			if j == 0 || line[j-1] == ' ' || line[j-1] == '\t' {
				return j
			}
		}
	}
	return -1
}

// findHeredoc looks for a shell-style heredoc opener in a single line and
// returns its delimiter plus whether '<<-' (tab/space stripping) was used.
func findHeredoc(line []byte) (delim string, strip bool, ok bool) {
	var q byte
	for j := 0; j < len(line); j++ {
		c := line[j]
		if q != 0 {
			if q != '\'' && c == '\\' && j+1 < len(line) {
				j++
				continue
			}
			if c == q {
				q = 0
			}
			continue
		}
		switch c {
		case '\'', '"', '`':
			q = c
		case '<':
			if j+1 >= len(line) || line[j+1] != '<' {
				continue
			}
			if j+2 < len(line) && line[j+2] == '<' {
				j += 2
				continue
			}
			k := j + 2
			st := false
			if k < len(line) && (line[k] == '-' || line[k] == '~') {
				st = line[k] == '-'
				k++
			}
			for k < len(line) && (line[k] == ' ' || line[k] == '\t') {
				k++
			}
			var dq byte
			if k < len(line) && (line[k] == '\'' || line[k] == '"' || line[k] == '`') {
				dq = line[k]
				k++
			}
			s0 := k
			for k < len(line) && (isWordByte(line[k]) || line[k] == '-' || line[k] == '.') {
				k++
			}
			if k == s0 {
				continue
			}
			d := string(line[s0:k])
			if dq != 0 && (k >= len(line) || line[k] != dq) {
				continue
			}
			return d, st, true
		}
	}
	return "", false, false
}

// ---------------------------------------------------------------------------
// batch scanner (cmd.exe): REM / :: lines
// ---------------------------------------------------------------------------

func stripBatch(src []byte, k *keeper) []byte {
	o := newOut(len(src))
	i, n := 0, len(src)
	for i < n {
		eol := i
		for eol < n && src[eol] != '\n' {
			eol++
		}
		line := src[i:eol]
		next := eol
		if next < n {
			next++
		}
		t := bytes.TrimLeft(line, " \t")
		low := bytes.ToLower(t)
		marker := ""
		switch {
		case bytes.HasPrefix(low, []byte("::")):
			marker = "::"
		case bytes.HasPrefix(low, []byte("rem")) && (len(t) == 3 || t[3] == ' ' || t[3] == '\t'):
			marker = "rem"
		}
		if marker != "" && !k.keep("batch", marker, strings.TrimSpace(string(line)), i == 0 && len(o.b) == 0) {
			i = next
			continue
		}
		o.write(line)
		if next > eol {
			o.writeByte('\n')
		}
		i = next
	}
	return o.b
}

// ---------------------------------------------------------------------------
// language registry
// ---------------------------------------------------------------------------

type langSpec struct {
	name string
	scan func(src []byte, k *keeper) []byte
}

func clikeLang(name string, cfg *clikeCfg) langSpec {
	cfg.lang = name
	return langSpec{name: name, scan: func(src []byte, k *keeper) []byte { return stripCLike(src, k, cfg) }}
}

func markupLang(name string, pairs [][2]string) langSpec {
	return langSpec{name: name, scan: func(src []byte, k *keeper) []byte { return stripMarkup(src, k, name, pairs) }}
}

var (
	qDQ       = quoteSpec{delim: '"', escBS: true}
	qSQ       = quoteSpec{delim: '\'', escBS: true}
	qSQRaw    = quoteSpec{delim: '\'', raw: true}
	qTpl      = quoteSpec{delim: '`', template: true, multiLine: true}
	qBQRaw    = quoteSpec{delim: '`', raw: true, multiLine: true}
	qDQTri    = quoteSpec{delim: '"', escBS: true, triple: true, multiLine: true}
	qSQTri    = quoteSpec{delim: '\'', escBS: true, triple: true, multiLine: true}
	qDQTriRaw = quoteSpec{delim: '"', raw: true, triple: true, multiLine: true}
	qSQTriRaw = quoteSpec{delim: '\'', raw: true, triple: true, multiLine: true}

	blockC    = [][2]string{{"/*", "*/"}}
	lineSlash = []string{"//"}
	lineHash  = []string{"#"}
)

var (
	cfgGo = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ, qBQRaw}}

	cfgJS   = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qTpl, qDQ, qSQ}, regex: true}
	cfgJSX  = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qTpl, qDQ, qSQ}, regex: true, jsx: true}
	cfgTS   = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qTpl, qDQ, qSQ}, regex: true}
	cfgTSX  = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qTpl, qDQ, qSQ}, regex: true, jsx: true}
	cfgJSON = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ}}

	cfgC   = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}}
	cfgCpp = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}, cppRaw: true}

	cfgJava    = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQTri, qDQ}}
	cfgCSharp  = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQTriRaw, qDQ}, rawPrefixes: []string{"@"}}
	cfgKotlin  = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQTriRaw, qDQ}, nestedBlock: true}
	cfgSwift   = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{{delim: '"', escBS: true, triple: true, multiLine: true, interpBS: true}, {delim: '"', escBS: true, interpBS: true}}, nestedBlock: true}
	cfgDart    = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qSQTri, qDQTri, qSQ, qDQ}, rawPrefixes: []string{"r"}}
	cfgScala   = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQTriRaw, qDQ}, nestedBlock: true}
	cfgPHP     = &clikeCfg{line: []string{"//", "#"}, block: blockC, quotes: []quoteSpec{qDQ, qSQ}}
	cfgRust    = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ}, rustRaw: true, nestedBlock: true}
	cfgZig     = &clikeCfg{line: lineSlash, quotes: []quoteSpec{qDQ}}
	cfgSol     = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}}
	cfgProto   = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}}
	cfgPrisma  = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ}}
	cfgGraphQL = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQTriRaw, qDQ}}
	cfgGroovy  = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qSQTri, qDQTri, qSQ, qDQ}}

	cfgCSS  = &clikeCfg{block: blockC, quotes: []quoteSpec{qDQ, qSQ}}
	cfgSCSS = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}, hashInterp: true, urlSpecial: true}
	cfgLess = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}, urlSpecial: true}
	cfgSass = &clikeCfg{line: lineSlash, block: blockC, quotes: []quoteSpec{qDQ, qSQ}, hashInterp: true, urlSpecial: true}

	cfgShell = &clikeCfg{line: lineHash, quotes: []quoteSpec{qSQRaw, qDQ}, heredoc: true, lineWordStart: true}
	cfgFish  = &clikeCfg{line: lineHash, quotes: []quoteSpec{qSQRaw, qDQ}}
	cfgPS    = &clikeCfg{line: lineHash, block: [][2]string{{"<#", "#>"}},
		quotes:      []quoteSpec{{delim: '\'', raw: true, escDouble: true}, {delim: '"', escDouble: true, escBacktick: true}},
		hereStrings: true}
	cfgDocker = &clikeCfg{line: lineHash, heredoc: true, lineStartOnly: true}

	cfgPython = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQTri, qSQTri, qDQ, qSQ},
		rawPrefixes: []string{"r", "R", "rb", "rB", "Rb", "RB", "br", "bR", "Br", "BR"}}
	cfgRuby    = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQ, qSQ}}
	cfgPerl    = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQ, qSQ}, perlPOD: true}
	cfgR       = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQ, qSQ}}
	cfgElixir  = &clikeCfg{line: lineHash, quotes: []quoteSpec{qSQTri, qDQTri, qSQ, qDQ}}
	cfgJulia   = &clikeCfg{line: lineHash, block: [][2]string{{"#=", "=#"}}, quotes: []quoteSpec{qDQTri, qDQ}, nestedBlock: true}
	cfgNim     = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQTriRaw, qDQ}}
	cfgCrystal = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQ, qSQ}}
	cfgCoffee  = &clikeCfg{line: lineHash, block: [][2]string{{"###", "###"}}, quotes: []quoteSpec{qSQTri, qDQTri, qSQ, qDQ}}

	cfgYAML       = &clikeCfg{line: lineHash, quotes: []quoteSpec{{delim: '\'', escDouble: true}, qDQ}, lineWordStart: true}
	cfgTOML       = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQTri, qSQTriRaw, qDQ, qSQRaw}}
	cfgINI        = &clikeCfg{line: []string{"#", ";"}, lineWordStart: true}
	cfgDotenv     = &clikeCfg{line: lineHash, quotes: []quoteSpec{qDQ, qSQRaw}, lineWordStart: true}
	cfgProperties = &clikeCfg{line: []string{"#", "!"}, lineWordStart: true}
	cfgIgnore     = &clikeCfg{line: lineHash, lineStartOnly: true}

	cfgSQL       = &clikeCfg{line: []string{"--"}, block: blockC, quotes: []quoteSpec{{delim: '\'', escBS: true, escDouble: true}, {delim: '"', escBS: true, escDouble: true}, {delim: '`', raw: true}}}
	cfgLua       = &clikeCfg{line: []string{"--"}, quotes: []quoteSpec{{delim: '[', luaLong: true}, qDQ, qSQ}, luaBlock: true}
	cfgHaskell   = &clikeCfg{line: []string{"--"}, block: [][2]string{{"{-", "-}"}}, quotes: []quoteSpec{qDQ}, nestedBlock: true}
	cfgOCaml     = &clikeCfg{block: [][2]string{{"(*", "*)"}}, quotes: []quoteSpec{qDQ}, nestedBlock: true}
	cfgLisp      = &clikeCfg{line: []string{";"}, block: [][2]string{{"#|", "|#"}}, quotes: []quoteSpec{qDQ}, nestedBlock: true}
	cfgClojure   = &clikeCfg{line: []string{";"}, quotes: []quoteSpec{qDQ}}
	cfgScheme    = &clikeCfg{line: []string{";"}, quotes: []quoteSpec{qDQ}}
	cfgErlang    = &clikeCfg{line: []string{"%"}, quotes: []quoteSpec{qDQ, qSQ}}
	cfgCMake     = &clikeCfg{line: lineHash, block: [][2]string{{"#[[", "]]"}}, quotes: []quoteSpec{qDQ}}
	cfgNix       = &clikeCfg{line: lineHash, block: blockC, quotes: []quoteSpec{qDQ}}
	cfgTerraform = &clikeCfg{line: []string{"#", "//"}, block: blockC, quotes: []quoteSpec{qDQ},
		heredoc: true, heredocStripSpaces: true}
)

var (
	pairsJinja = [][2]string{{"{#", "#}"}, {"<!--", "-->"}, {"{% comment %}", "{% endcomment %}"}}
	pairsHbs   = [][2]string{{"{{!--", "--}}"}, {"{{!", "}}"}, {"<!--", "-->"}}
	pairsEJS   = [][2]string{{"<%#", "%>"}, {"<!--", "-->"}}
	pairsJSP   = [][2]string{{"<%--", "--%>"}, {"<!--", "-->"}}
	pairsRazor = [][2]string{{"@*", "*@"}, {"<!--", "-->"}}
	pairsBlade = [][2]string{{"{{--", "--}}"}, {"<!--", "-->"}}
)

var (
	langGo     = clikeLang("go", cfgGo)
	langJS     = clikeLang("js", cfgJS)
	langJSX    = clikeLang("js", cfgJSX)
	langTS     = clikeLang("ts", cfgTS)
	langTSX    = clikeLang("ts", cfgTSX)
	langJSONC  = clikeLang("jsonc", cfgJSON)
	langC      = clikeLang("c", cfgC)
	langCpp    = clikeLang("cpp", cfgCpp)
	langJava   = clikeLang("java", cfgJava)
	langCS     = clikeLang("csharp", cfgCSharp)
	langKt     = clikeLang("kotlin", cfgKotlin)
	langSwift  = clikeLang("swift", cfgSwift)
	langDart   = clikeLang("dart", cfgDart)
	langScala  = clikeLang("scala", cfgScala)
	langPHP    = langSpec{name: "php", scan: stripPHP}
	langRust   = clikeLang("rust", cfgRust)
	langZig    = clikeLang("zig", cfgZig)
	langSol    = clikeLang("solidity", cfgSol)
	langProto  = clikeLang("proto", cfgProto)
	langPrisma = clikeLang("prisma", cfgPrisma)
	langGQL    = clikeLang("graphql", cfgGraphQL)
	langGroovy = clikeLang("groovy", cfgGroovy)

	langCSS  = clikeLang("css", cfgCSS)
	langSCSS = clikeLang("scss", cfgSCSS)
	langLess = clikeLang("less", cfgLess)
	langSass = clikeLang("sass", cfgSass)

	langShell  = clikeLang("shell", cfgShell)
	langFish   = clikeLang("shell", cfgFish)
	langPS     = clikeLang("ps", cfgPS)
	langDocker = clikeLang("docker", cfgDocker)
	langMake   = langSpec{name: "make", scan: stripMake}
	langBatch  = langSpec{name: "batch", scan: stripBatch}

	langPython  = clikeLang("python", cfgPython)
	langRuby    = clikeLang("ruby", cfgRuby)
	langPerl    = clikeLang("perl", cfgPerl)
	langRStats  = clikeLang("r", cfgR)
	langElixir  = clikeLang("elixir", cfgElixir)
	langJulia   = clikeLang("julia", cfgJulia)
	langNim     = clikeLang("nim", cfgNim)
	langCrystal = clikeLang("crystal", cfgCrystal)
	langCoffee  = clikeLang("coffee", cfgCoffee)

	langYAML       = clikeLang("yaml", cfgYAML)
	langTOML       = clikeLang("toml", cfgTOML)
	langINI        = clikeLang("ini", cfgINI)
	langDotenv     = clikeLang("dotenv", cfgDotenv)
	langProperties = clikeLang("properties", cfgProperties)
	langIgnore     = clikeLang("ignore", cfgIgnore)

	langSQL       = clikeLang("sql", cfgSQL)
	langLua       = clikeLang("lua", cfgLua)
	langHaskell   = clikeLang("haskell", cfgHaskell)
	langOCaml     = clikeLang("ocaml", cfgOCaml)
	langLisp      = clikeLang("lisp", cfgLisp)
	langClojure   = clikeLang("clojure", cfgClojure)
	langScheme    = clikeLang("scheme", cfgScheme)
	langErlang    = clikeLang("erlang", cfgErlang)
	langCMake     = clikeLang("cmake", cfgCMake)
	langNix       = clikeLang("nix", cfgNix)
	langTerraform = clikeLang("terraform", cfgTerraform)

	langMarkdown = langSpec{name: "markdown", scan: func(src []byte, k *keeper) []byte { return stripMarkdown(src, k, false) }}
	langMDX      = langSpec{name: "mdx", scan: func(src []byte, k *keeper) []byte { return stripMarkdown(src, k, true) }}
	langHTML     = langSpec{name: "html", scan: func(src []byte, k *keeper) []byte { return stripHTML(src, k, true) }}
	langXML      = langSpec{name: "xml", scan: func(src []byte, k *keeper) []byte { return stripHTML(src, k, false) }}

	langJinja = markupLang("jinja", pairsJinja)
	langHbs   = markupLang("handlebars", pairsHbs)
	langEJS   = markupLang("ejs", pairsEJS)
	langERB   = markupLang("erb", pairsEJS)
	langJSP   = markupLang("jsp", pairsJSP)
	langASP   = markupLang("asp", pairsJSP)
	langRazor = markupLang("razor", pairsRazor)
	langBlade = markupLang("blade", pairsBlade)
)

var extLangs = map[string]langSpec{
	// Go
	".go": langGo,
	// JavaScript / TypeScript
	".js": langJS, ".mjs": langJS, ".cjs": langJS, ".jsx": langJSX,
	".ts": langTS, ".mts": langTS, ".cts": langTS, ".tsx": langTSX,
	".json": langJSONC, ".jsonc": langJSONC, ".json5": langJSONC,
	// styles
	".css": langCSS, ".scss": langSCSS, ".less": langLess, ".sass": langSass,
	// C family
	".c": langC, ".h": langC,
	".cc": langCpp, ".cxx": langCpp, ".cpp": langCpp, ".c++": langCpp, ".cp": langCpp,
	".hpp": langCpp, ".hh": langCpp, ".hxx": langCpp, ".h++": langCpp,
	".ipp": langCpp, ".tpp": langCpp, ".inl": langCpp,
	// JVM / .NET / other C-like
	".java": langJava, ".cs": langCS, ".csx": langCS,
	".kt": langKt, ".kts": langKt, ".swift": langSwift, ".dart": langDart,
	".scala": langScala, ".sc": langScala,
	".php": langPHP, ".phtml": langPHP,
	".rs": langRust, ".zig": langZig, ".sol": langSol,
	".proto": langProto, ".prisma": langPrisma, ".graphql": langGQL, ".gql": langGQL,
	// shells / infra
	".sh": langShell, ".bash": langShell, ".zsh": langShell, ".ksh": langShell,
	".dash": langShell, ".ash": langShell, ".csh": langShell, ".tcsh": langShell,
	".fish": langFish,
	".ps1":  langPS, ".psm1": langPS, ".psd1": langPS, ".pssc": langPS,
	".bat": langBatch, ".cmd": langBatch,
	".mk": langMake, ".cmake": langCMake, ".nix": langNix,
	".tf": langTerraform, ".tfvars": langTerraform, ".hcl": langTerraform, ".nomad": langTerraform,
	// scripting
	".py": langPython, ".pyi": langPython, ".pyw": langPython,
	".rb": langRuby, ".rake": langRuby, ".gemspec": langRuby, ".rbw": langRuby,
	".pl": langPerl, ".pm": langPerl, ".t": langPerl,
	".r":  langRStats,
	".ex": langElixir, ".exs": langElixir,
	".jl": langJulia, ".nim": langNim, ".nims": langNim,
	".cr": langCrystal, ".coffee": langCoffee, ".litcoffee": langCoffee,
	".lua": langLua,
	// config
	".yml": langYAML, ".yaml": langYAML, ".toml": langTOML,
	".ini": langINI, ".cfg": langINI, ".conf": langINI, ".properties": langProperties,
	".sql": langSQL, ".ddl": langSQL, ".dml": langSQL,
	// functional
	".hs": langHaskell, ".ml": langOCaml, ".mli": langOCaml,
	".lisp": langLisp, ".lsp": langLisp, ".cl": langLisp, ".el": langLisp,
	".clj": langClojure, ".cljs": langClojure, ".cljc": langClojure, ".edn": langClojure,
	".scm": langScheme, ".ss": langScheme,
	".erl": langErlang, ".hrl": langErlang,
	// docs / markup
	".md": langMarkdown, ".markdown": langMarkdown, ".mdown": langMarkdown, ".mkd": langMarkdown,
	".mdx":  langMDX,
	".html": langHTML, ".htm": langHTML, ".xhtml": langHTML, ".shtml": langHTML,
	".vue": langHTML, ".svelte": langHTML, ".astro": langHTML,
	".xml": langXML, ".svg": langXML, ".xsl": langXML, ".xslt": langXML, ".xsd": langXML,
	".plist": langXML, ".csproj": langXML, ".vbproj": langXML, ".fsproj": langXML,
	".props": langXML, ".targets": langXML, ".resx": langXML, ".wsdl": langXML,
	// templates
	".twig": langJinja, ".njk": langJinja, ".nunjucks": langJinja,
	".j2": langJinja, ".jinja": langJinja, ".jinja2": langJinja,
	".hbs": langHbs, ".handlebars": langHbs, ".mustache": langHbs,
	".ejs": langEJS, ".erb": langERB, ".rhtml": langERB,
	".jsp": langJSP, ".jspf": langJSP, ".jspx": langJSP, ".asp": langASP,
	".cshtml": langRazor, ".vbhtml": langRazor,
}

var nameLangs = map[string]langSpec{
	"makefile": langMake, "gnumakefile": langMake, "justfile": langMake,
	"dockerfile": langDocker, "containerfile": langDocker,
	"cmakelists.txt": langCMake,
	"jenkinsfile":    langGroovy,
	"gemfile":        langRuby, "rakefile": langRuby, "vagrantfile": langRuby,
	"brewfile": langRuby, "fastfile": langRuby, "podfile": langRuby, "guardfile": langRuby,
	"procfile":   langShell,
	".gitignore": langIgnore, ".dockerignore": langIgnore, ".npmignore": langIgnore,
	".eslintignore": langIgnore, ".prettierignore": langIgnore, ".stylelintignore": langIgnore,
	".gitattributes": langIgnore,
	".editorconfig":  langINI, ".npmrc": langINI, ".yarnrc": langINI, ".htaccess": langINI,
	".flake8": langINI, ".pylintrc": langINI,
	".env":    langDotenv,
	".bashrc": langShell, ".bash_profile": langShell, ".bash_login": langShell, ".bash_logout": langShell,
	".profile": langShell, ".zshrc": langShell, ".zprofile": langShell, ".zshenv": langShell,
	".zlogin": langShell, ".zlogout": langShell, ".kshrc": langShell,
}

func detectLang(path string) (langSpec, bool) {
	base := filepath.Base(path)
	low := strings.ToLower(base)
	if l, ok := nameLangs[low]; ok {
		return l, true
	}
	switch {
	case low == "dockerfile" || low == "containerfile" ||
		strings.HasPrefix(low, "dockerfile.") || strings.HasPrefix(low, "containerfile."):
		return langDocker, true
	case strings.HasPrefix(low, "makefile."):
		return langMake, true
	case low == ".env" || strings.HasPrefix(low, ".env."):
		return langDotenv, true
	case strings.HasSuffix(low, ".blade.php"):
		return langBlade, true
	}
	if ext := strings.ToLower(filepath.Ext(base)); ext != "" {
		if l, ok := extLangs[ext]; ok {
			return l, true
		}
	}
	if l := shebangLang(path); l != nil {
		return *l, true
	}
	return langSpec{}, false
}

// shebangLang detects the language of an extension-less executable script by
// reading its shebang line.
func shebangLang(path string) *langSpec {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()
	buf := make([]byte, 256)
	n, _ := f.Read(buf)
	buf = buf[:n]
	if !bytes.HasPrefix(buf, []byte("#!")) {
		return nil
	}
	line := buf[2:]
	if i := bytes.IndexByte(line, '\n'); i >= 0 {
		line = line[:i]
	}
	fields := strings.Fields(string(line))
	if len(fields) == 0 {
		return nil
	}
	interp := fields[0]
	if filepath.Base(interp) == "env" {
		interp = ""
		for _, f := range fields[1:] {
			if strings.HasPrefix(f, "-") {
				if f == "-S" || strings.HasPrefix(f, "-S") {
					// env -S "cmd args..." — the command may follow directly
					if rest := strings.TrimPrefix(f, "-S"); rest != "" {
						interp = rest
						break
					}
				}
				continue
			}
			interp = f
			break
		}
		if interp == "" {
			return nil
		}
	}
	name := filepath.Base(interp)
	switch {
	case name == "sh", name == "bash", name == "zsh", name == "dash", name == "ksh",
		name == "ash", name == "fish", name == "csh", name == "tcsh":
		return &langShell
	case name == "python" || strings.HasPrefix(name, "python2") || strings.HasPrefix(name, "python3"):
		return &langPython
	case name == "ruby":
		return &langRuby
	case name == "perl" || strings.HasPrefix(name, "perl5"):
		return &langPerl
	case name == "node", name == "nodejs", name == "deno", name == "bun":
		return &langJS
	case name == "lua" || name == "luajit" || strings.HasPrefix(name, "lua5"):
		return &langLua
	case name == "pwsh", name == "powershell":
		return &langPS
	case name == "php":
		return &langPHP
	}
	return nil
}
