package main

import (
	"bytes"
	"crypto/md5"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"testing"
	"time"
)

func canonicalTempDir(t *testing.T) string {
	t.Helper()
	directory, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return directory
}

func writeFixture(t *testing.T, filename, contents string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(filename), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filename, []byte(contents), 0o644); err != nil {
		t.Fatal(err)
	}
}

func fixtureHash(contents string) string {
	hash := md5.Sum([]byte(contents))
	return hex.EncodeToString(hash[:])
}

func runReport(t *testing.T, args ...string) report {
	t.Helper()
	var out, stderr bytes.Buffer
	if code := run(append([]string{"--json"}, args...), &out, &stderr); code != 0 {
		t.Fatalf("exit=%d stdout=%s stderr=%s", code, &out, &stderr)
	}
	if stderr.Len() != 0 {
		t.Fatalf("JSON mode wrote to stderr: %s", &stderr)
	}
	var result report
	if err := json.Unmarshal(out.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	return result
}

func checkedFingerprint(t *testing.T, filename string, checks *directoryChecks) fingerprint {
	t.Helper()
	value := fingerprintFile(filename, checks, make([]byte, hashBufferSize), &hashProgress{})
	if value.err != nil {
		t.Fatal(value.err)
	}
	return value
}

func TestPreviewApplyAndRepeat(t *testing.T) {
	root := canonicalTempDir(t)
	contents := "video bytes"
	hash := fixtureHash(contents)
	for name, data := range map[string]string{
		"a.MP4": contents, "b.MP4": contents, hash + ".MP4": contents,
		".hidden": "hidden contents", "nested/c.mkv": "other video",
		"node_modules/keep.mp4": "excluded dependency", "sensitive/keep.mp4": "excluded custom",
	} {
		writeFixture(t, filepath.Join(root, name), data)
	}
	if err := os.Link(filepath.Join(root, "a.MP4"), filepath.Join(root, "hard.MP4")); err != nil {
		t.Fatal(err)
	}
	outside := filepath.Join(canonicalTempDir(t), "external.mp4")
	writeFixture(t, outside, "external video")
	if err := os.Symlink(outside, filepath.Join(root, "external-link.mp4")); err != nil {
		t.Fatal(err)
	}
	dangling := filepath.Join(root, hash+"-1.MP4")
	if err := os.Symlink("does-not-exist", dangling); err != nil {
		t.Fatal(err)
	}

	// Positional roots can precede flags, and overlapping roots are deduplicated.
	preview := runReport(t, root, filepath.Join(root, "nested"), "--exclude", "sensitive", "--concurrency=4")
	if preview.TotalFiles != 6 || preview.WouldRename != 5 || preview.Unchanged != 1 || preview.Skipped != 4 || len(preview.Roots) != 1 {
		t.Fatalf("unexpected preview: %+v", preview)
	}
	for _, planned := range preview.Results {
		if _, err := os.Lstat(planned.Source); err != nil {
			t.Fatalf("preview changed source: %v", err)
		}
		if _, err := os.Lstat(planned.Target); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("preview created target %s: %v", planned.Target, err)
		}
	}

	applied := runReport(t, "--apply", "--exclude=sensitive", root)
	if applied.Renamed != 5 || applied.Unchanged != 1 {
		t.Fatalf("unexpected apply: %+v", applied)
	}
	for i, renamed := range applied.Results {
		if renamed.Target != preview.Results[i].Target || extension(renamed.Source) != extension(renamed.Target) {
			t.Fatalf("destination or extension changed: %+v", renamed)
		}
		data, err := os.ReadFile(renamed.Target)
		if err != nil || fixtureHash(string(data)) != renamed.Hash {
			t.Fatalf("content changed: %s: %v", renamed.Target, err)
		}
		if _, err := os.Lstat(renamed.Source); !errors.Is(err, os.ErrNotExist) {
			t.Fatalf("source still present: %s: %v", renamed.Source, err)
		}
	}
	first, err := os.Stat(filepath.Join(root, hash+"-2.MP4"))
	if err != nil {
		t.Fatal(err)
	}
	hard, err := os.Stat(filepath.Join(root, hash+"-4.MP4"))
	if err != nil || !os.SameFile(first, hard) {
		t.Fatalf("hard links were not preserved: %v", err)
	}
	if link, err := os.Readlink(dangling); err != nil || link != "does-not-exist" {
		t.Fatalf("dangling destination was overwritten: %q %v", link, err)
	}
	for filename, expected := range map[string]string{
		outside: "external video", filepath.Join(root, "node_modules/keep.mp4"): "excluded dependency",
		filepath.Join(root, "sensitive/keep.mp4"): "excluded custom",
	} {
		if data, err := os.ReadFile(filename); err != nil || string(data) != expected {
			t.Fatalf("excluded file changed: %s: %v", filename, err)
		}
	}
	repeated := runReport(t, "--apply", root, "--exclude", "sensitive")
	if repeated.Renamed != 0 || repeated.Unchanged != 6 {
		t.Fatalf("repeat was not idempotent: %+v", repeated)
	}
}

func TestMoveRefusesChangedFileWithRestoredMtime(t *testing.T) {
	root := canonicalTempDir(t)
	source := filepath.Join(root, "video.mp4")
	writeFixture(t, source, "before")
	checks := newDirectoryChecks()
	value := checkedFingerprint(t, source, checks)
	writeFixture(t, source, "after!") // Same length; inode and mtime alone are insufficient.
	if err := os.Chtimes(source, time.Now(), value.stat.ModTime()); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(root, value.hash+".mp4")
	err := moveWithoutOverwrite(value, target, checks, make(map[string]os.FileInfo))
	if err == nil || !strings.Contains(err.Error(), "changed after fingerprinting") {
		t.Fatalf("changed content was accepted: %v", err)
	}
	if data, err := os.ReadFile(source); err != nil || string(data) != "after!" {
		t.Fatalf("changed source was damaged: %v", err)
	}
	if _, err := os.Lstat(target); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("target unexpectedly created: %v", err)
	}
}

func TestDestinationCreatedAfterPlanningIsNotOverwritten(t *testing.T) {
	root := canonicalTempDir(t)
	source := filepath.Join(root, "video.mp4")
	writeFixture(t, source, "video")
	checks := newDirectoryChecks()
	value := checkedFingerprint(t, source, checks)
	picker := newTargetPicker([]string{source})
	target, err := picker.pick(source, value.hash)
	if err != nil {
		t.Fatal(err)
	}
	writeFixture(t, target, "concurrent occupant")
	states := make(map[string]os.FileInfo)
	if err := moveWithoutOverwrite(value, target, checks, states); !errors.Is(err, os.ErrExist) {
		t.Fatalf("expected a destination conflict: %v", err)
	}
	next, err := picker.pick(source, value.hash)
	if err != nil || next != filepath.Join(root, value.hash+"-1.mp4") {
		t.Fatalf("unexpected retry target: %q %v", next, err)
	}
	if err := moveWithoutOverwrite(value, next, checks, states); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(target); err != nil || string(data) != "concurrent occupant" {
		t.Fatalf("occupant was overwritten: %v", err)
	}
	if data, err := os.ReadFile(next); err != nil || string(data) != "video" {
		t.Fatalf("source contents changed: %v", err)
	}
}

func TestDirectoryReplacementIsRejected(t *testing.T) {
	root := canonicalTempDir(t)
	directory := filepath.Join(root, "videos")
	source := filepath.Join(directory, "video.mp4")
	writeFixture(t, source, "original")
	checks := newDirectoryChecks()
	value := checkedFingerprint(t, source, checks)
	oldDirectory := filepath.Join(root, "old-videos")
	if err := os.Rename(directory, oldDirectory); err != nil {
		t.Fatal(err)
	}
	writeFixture(t, source, "replacement")
	err := moveWithoutOverwrite(value, filepath.Join(directory, value.hash+".mp4"), checks, make(map[string]os.FileInfo))
	if err == nil || !strings.Contains(err.Error(), "directory changed") {
		t.Fatalf("replaced directory was accepted: %v", err)
	}
	for filename, expected := range map[string]string{source: "replacement", filepath.Join(oldDirectory, "video.mp4"): "original"} {
		if data, err := os.ReadFile(filename); err != nil || string(data) != expected {
			t.Fatalf("file damaged: %s: %v", filename, err)
		}
	}
}

func TestParallelHashesAcrossBufferBoundaries(t *testing.T) {
	root := canonicalTempDir(t)
	var files, expected []string
	var totalBytes int64
	for i, size := range []int{0, 1, hashBufferSize - 1, hashBufferSize + 1, 2*hashBufferSize + 73} {
		data := bytes.Repeat([]byte{byte(i)}, size)
		filename := filepath.Join(root, strings.Repeat("v", i+1)+".mp4")
		if err := os.WriteFile(filename, data, 0o644); err != nil {
			t.Fatal(err)
		}
		hash := md5.Sum(data)
		files = append(files, filename)
		expected = append(expected, hex.EncodeToString(hash[:]))
		totalBytes += int64(size)
	}
	progress := &hashProgress{}
	values := fingerprintFiles(files, 4, newDirectoryChecks(), progress)
	for i, value := range values {
		if value.err != nil || value.file != files[i] || value.hash != expected[i] {
			t.Fatalf("wrong hash or order: %+v", value)
		}
	}
	if progress.bytes.Load() != totalBytes || progress.files.Load() != int64(len(files)) {
		t.Fatalf("wrong progress counts: %d bytes, %d files", progress.bytes.Load(), progress.files.Load())
	}
}

func TestFingerprintRejectsSymlinksAndFIFOs(t *testing.T) {
	root := canonicalTempDir(t)
	source := filepath.Join(root, "video.mp4")
	writeFixture(t, source, "video")
	link := filepath.Join(root, "link.mp4")
	if err := os.Symlink(source, link); err != nil {
		t.Fatal(err)
	}
	fifo := filepath.Join(root, "fifo.mp4")
	if err := syscall.Mkfifo(fifo, 0o600); err != nil {
		t.Fatal(err)
	}
	for _, filename := range []string{link, fifo} {
		value := fingerprintFile(filename, newDirectoryChecks(), make([]byte, hashBufferSize), &hashProgress{})
		if value.err == nil {
			t.Fatalf("accepted a nonregular file: %s", filename)
		}
	}
}

func TestUnsafeApplyAndInvalidUsage(t *testing.T) {
	for _, args := range [][]string{{"--apply"}, {"--apply", "--dry-run", "."}, {"--concurrency", "0"}, {"--concurrency=65"}, {"--unknown"}} {
		var out, stderr bytes.Buffer
		if code := run(append(args, "--json"), &out, &stderr); code != 2 || out.Len() != 0 || !json.Valid(stderr.Bytes()) {
			t.Fatalf("args=%v code=%d stdout=%s stderr=%s", args, code, &out, &stderr)
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		t.Fatal(err)
	}
	for _, root := range []string{"/", home} {
		var out, stderr bytes.Buffer
		if code := run([]string{"--apply", "--json", root}, &out, &stderr); code != 1 {
			t.Fatalf("unsafe root %q: exit=%d", root, code)
		}
		var result report
		if err := json.Unmarshal(out.Bytes(), &result); err != nil || result.TotalFiles != 0 || result.Renamed != 0 || result.Failures == 0 {
			t.Fatalf("unsafe root was processed: %s %v", &out, err)
		}
	}
}
