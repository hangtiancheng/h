package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

type result struct {
	dir       string
	pin       string
	git       string
	gitOutput string
	gitFailed bool
	output    string
	err       error
	elapsed   time.Duration
}

var packageManagerRe = regexp.MustCompile(`("packageManager"\s*:\s*")([^"]*)(")`)

func main() {
	root := flag.String("dir", ".", "root directory to scan (shallow, direct children only)")
	jobs := flag.Int("j", 4, "number of projects processed concurrently")
	timeout := flag.Duration("timeout", 30*time.Minute, "timeout per project")
	registry := flag.String("registry", "https://registry.npmjs.org/", "npm registry")
	pnpmVersion := flag.String("pnpm-version", "latest", "pnpm version to unify on (\"latest\" or an exact version)")
	pin := flag.Bool("pin", true, "rewrite packageManager in each project's package.json to the target pnpm version")
	bypassAge := flag.Bool("bypass-minimum-release-age", true, "pass --config.minimumReleaseAge=0 to skip pnpm's built-in 24h minimumReleaseAge supply-chain policy")
	gitPush := flag.Bool("git-push", true, "after a successful update, run `pnpm git:config && pnpm git:push` (best-effort; failures are reported but do not change the exit code)")
	verbose := flag.Bool("v", false, "always print full pnpm output")
	dryRun := flag.Bool("n", false, "list matched projects without changing anything")
	flag.Parse()

	if *jobs < 1 {
		*jobs = 1
	}

	projects, err := scan(*root)
	if err != nil {
		fmt.Fprintln(os.Stderr, "scan:", err)
		os.Exit(1)
	}
	if len(projects) == 0 {
		fmt.Fprintln(os.Stderr, "no projects found")
		return
	}

	if *dryRun {
		fmt.Printf("found %d projects under %s\n", len(projects), absOr(*root))
		for _, p := range projects {
			fmt.Printf("  %-18s packageManager=%s\n", filepath.Base(p), currentPackageManager(p))
		}
		return
	}

	if _, err := exec.LookPath("corepack"); err != nil {
		fmt.Fprintln(os.Stderr, "corepack not found in PATH:", err)
		os.Exit(1)
	}

	version, err := resolvePnpmVersion(*pnpmVersion)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Printf("pnpm target: %s (from %q)\n", version, *pnpmVersion)
	fmt.Printf("found %d projects, %d workers, pin=%t, bypassMinimumReleaseAge=%t, gitPush=%t\n",
		len(projects), *jobs, *pin, *bypassAge, *gitPush)
	for _, p := range projects {
		fmt.Printf("  %-18s %s\n", filepath.Base(p), currentPackageManager(p))
	}
	fmt.Println()

	sem := make(chan struct{}, *jobs)
	results := make(chan result, len(projects))
	var wg sync.WaitGroup
	start := time.Now()

	for _, p := range projects {
		wg.Add(1)
		go func(dir string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			results <- process(dir, version, *pin, *bypassAge, *gitPush, *timeout, *registry)
		}(p)
	}
	go func() {
		wg.Wait()
		close(results)
	}()

	failed, pinned, gitPushed, gitFailedCount := 0, 0, 0, 0
	for r := range results {
		if r.err != nil {
			failed++
			fmt.Printf("[FAIL] %s (%s)\n", filepath.Base(r.dir), r.elapsed.Round(time.Millisecond))
		} else {
			fmt.Printf("[ ok ] %s (%s)\n", filepath.Base(r.dir), r.elapsed.Round(time.Millisecond))
		}
		if r.pin != "" {
			pinned++
			fmt.Printf("       packageManager: %s\n", r.pin)
		}
		out := strings.TrimSpace(r.output)
		if out != "" && (*verbose || r.err != nil) {
			for _, line := range strings.Split(out, "\n") {
				fmt.Println("       " + line)
			}
		}
		if r.git != "" {
			if r.gitFailed {
				gitFailedCount++
			} else if strings.HasPrefix(r.git, "pushed") {
				gitPushed++
			}
			fmt.Printf("       git: %s\n", r.git)
			gitOut := strings.TrimSpace(r.gitOutput)
			if gitOut != "" && (r.gitFailed || *verbose) {
				for _, line := range tailLines(gitOut, 6) {
					fmt.Println("       " + line)
				}
			}
		}
	}

	fmt.Printf("\n%d/%d succeeded, %d pinned to pnpm@%s, git: %d pushed / %d failed in %s\n",
		len(projects)-failed, len(projects), pinned, version, gitPushed, gitFailedCount,
		time.Since(start).Round(time.Millisecond))
	if failed > 0 {
		os.Exit(1)
	}
}

func scan(root string) ([]string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	markers := []string{"package.json", "pnpm-workspace.yaml", "pnpm-workspace.yml"}
	var projects []string
	for _, e := range entries {
		if !e.IsDir() || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		dir := filepath.Join(root, e.Name())
		for _, m := range markers {
			if _, err := os.Stat(filepath.Join(dir, m)); err == nil {
				projects = append(projects, dir)
				break
			}
		}
	}
	sort.Strings(projects)
	return projects, nil
}

func process(dir, version string, pin, bypassAge, gitPush bool, timeout time.Duration, registry string) result {
	start := time.Now()
	res := result{dir: dir}

	if pin {
		change, err := pinPackageManager(filepath.Join(dir, "package.json"), version)
		if err != nil {
			res.err = fmt.Errorf("pin packageManager: %w", err)
			res.elapsed = time.Since(start)
			return res
		}
		res.pin = change
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	args := []string{"pnpm@" + version, "update", "-r", "--registry=" + registry}
	if bypassAge {
		args = append(args, "--config.minimumReleaseAge=0")
	}
	cmd := exec.CommandContext(ctx, "corepack", args...)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "COREPACK_ENABLE_STRICT=0", "CI=1")

	out, err := cmd.CombinedOutput()
	if ctx.Err() != nil {
		err = fmt.Errorf("timed out after %s", timeout)
	}
	res.output = string(out)
	res.err = err
	res.elapsed = time.Since(start)

	if res.err == nil && gitPush {
		status, failed, gitOut := runGitStep(dir, bypassAge, timeout)
		res.git = status
		res.gitFailed = failed
		res.gitOutput = gitOut
	}
	return res
}

func resolvePnpmVersion(spec string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "corepack", "pnpm@"+spec, "--version")
	cmd.Dir = os.TempDir()
	cmd.Env = append(os.Environ(), "COREPACK_ENABLE_STRICT=0")

	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("resolve pnpm@%s: %w", spec, err)
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	version := strings.TrimSpace(lines[len(lines)-1])
	if version == "" {
		return "", fmt.Errorf("resolve pnpm@%s: empty version", spec)
	}
	return version, nil
}

func currentPackageManager(dir string) string {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return "(no package.json)"
	}
	if m := packageManagerRe.FindSubmatch(data); m != nil {
		return string(m[2])
	}
	return "(none)"
}

func pinPackageManager(path, version string) (string, error) {
	want := "pnpm@" + version

	info, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return "", err
	}
	src := string(data)

	if m := packageManagerRe.FindStringSubmatchIndex(src); m != nil {
		current := src[m[4]:m[5]]
		if current == want {
			return "", nil
		}
		out := src[:m[4]] + want + src[m[5]:]
		if err := os.WriteFile(path, []byte(out), info.Mode().Perm()); err != nil {
			return "", err
		}
		return fmt.Sprintf("%s -> %s", current, want), nil
	}

	open := strings.Index(src, "{")
	if open < 0 {
		return "", fmt.Errorf("%s: not a JSON object", path)
	}
	rest := src[open+1:]

	indent := "  "
	for _, line := range strings.Split(rest, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || trimmed == "}" {
			continue
		}
		indent = line[:len(line)-len(strings.TrimLeft(line, " \t"))]
		break
	}

	entry := "\n" + indent + `"packageManager": "` + want + `",`
	if strings.TrimSpace(rest) == "}" {
		entry = "\n" + indent + `"packageManager": "` + want + `"` + "\n"
	}

	if err := os.WriteFile(path, []byte(src[:open+1]+entry+rest), info.Mode().Perm()); err != nil {
		return "", err
	}
	return fmt.Sprintf("(none) -> %s", want), nil
}

func absOr(p string) string {
	if abs, err := filepath.Abs(p); err == nil {
		return abs
	}
	return p
}

func runGitStep(dir string, bypassAge bool, timeout time.Duration) (status string, failed bool, output string) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	script := "pnpm git:config && pnpm git:push"
	if bypassAge {
		script = "pnpm --config.minimumReleaseAge=0 git:config && pnpm --config.minimumReleaseAge=0 git:push"
	}
	cmd := exec.CommandContext(ctx, "sh", "-c", script)
	cmd.Dir = dir
	cmd.Env = append(os.Environ(), "CI=1")

	out, err := cmd.CombinedOutput()
	output = string(out)
	if ctx.Err() != nil {
		return fmt.Sprintf("FAILED (timeout after %s)", timeout), true, output
	}
	if err == nil {
		return "pushed", false, output
	}

	low := strings.ToLower(output)
	switch {
	case strings.Contains(low, "nothing to commit"):
		return "skipped (nothing to commit)", false, output
	case strings.Contains(low, "not a git repository"):
		return "FAILED (not a git repository)", true, output
	case strings.Contains(output, `Command "git:`), strings.Contains(low, "command not found"), strings.Contains(low, "missing script"):
		return "FAILED (git:config/git:push script not defined)", true, output
	case strings.Contains(low, "husky"), strings.Contains(low, "lint-staged"):
		return "FAILED (rejected by husky/lint-staged)", true, output
	case strings.Contains(low, "no such remote"), strings.Contains(output, "'origin'"), strings.Contains(low, "no upstream"), strings.Contains(low, "couldn't find remote"), strings.Contains(low, "could not read from remote"):
		return "FAILED (origin/remote problem)", true, output
	default:
		return "FAILED (git step)", true, output
	}
}

func tailLines(s string, n int) []string {
	lines := strings.Split(s, "\n")
	if len(lines) <= n {
		return lines
	}
	return lines[len(lines)-n:]
}
