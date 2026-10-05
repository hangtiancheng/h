#!/usr/bin/env node
// @ts-check
/**
 * Clear rebuildable user caches on macOS and Linux.
 * Preview by default; use --apply to delete and --json for structured output.
 * Unavailable paths and deletion errors are skipped. Cache roots, symlinks,
 * JetBrains local history, and pnpm virtual-store links are preserved.
 * System caches, application settings, and temporary directories are untouched.
 */
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  lstat,
  open,
  readdir,
  realpath,
  rmdir,
  statfs,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** @param {unknown} error */
const message = (error) =>
  error instanceof Error ? error.message : String(error);
/** @param {string} parent @param {string} child */
export function inside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
/** @param {unknown} error @param {string} code */
const hasCode = (error, code) =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

/** Read cache configuration without a shell or cleanup side effects.
 * @param {string} command @param {string[]} args @param {string} home
 * @returns {Promise<string>}
 */
function query(command, args, home) {
  return new Promise((resolve) => {
    try {
      execFile(
        command,
        args,
        {
          cwd: home,
          encoding: "utf8",
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          env: {
            ...process.env,
            GOTOOLCHAIN: "local",
            HOMEBREW_NO_AUTO_UPDATE: "1",
            COREPACK_ENABLE_NETWORK: "0",
          },
        },
        (error, stdout) => resolve(error ? "" : stdout.trim()),
      );
    } catch {
      resolve("");
    }
  });
}

/** @param {string[]} args */
export function optionsFrom(args) {
  for (const argument of args) {
    if (
      !["--apply", "-y", "--dry-run", "--json", "--help", "-h"].includes(
        argument,
      )
    )
      throw new Error(`Unknown argument: ${argument}`);
  }
  const apply = args.includes("--apply") || args.includes("-y");
  if (apply && args.includes("--dry-run"))
    throw new Error("--apply and --dry-run cannot be combined.");
  return {
    apply,
    json: args.includes("--json"),
    help: args.includes("--help") || args.includes("-h"),
  };
}

/** Verify cache scope and reject symlinked ancestors before accessing contents.
 * @param {string} home @param {string} filename
 */
export async function checkPath(home, filename) {
  if (filename === home || !inside(home, filename))
    throw new Error("Path is outside the cache cleanup scope.");
  let current = home;
  for (const component of path.relative(home, filename).split(path.sep)) {
    current = path.join(current, component);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error("Symbolic links are preserved.");
  }
  if ((await realpath(filename)) !== filename)
    throw new Error("Path resolves through a symbolic link.");
  return lstat(filename);
}

/** Discover cache directories, including configured package-manager locations.
 * @param {string} home @param {string} [platform]
 */
export async function cachePaths(home, platform = process.platform) {
  const mac = platform === "darwin";
  const join = (/** @type {string} */ name) => path.join(home, name);
  const candidates = new Set();
  /** @param {string} filename */
  function add(filename) {
    if (
      path.isAbsolute(filename) &&
      filename !== home &&
      inside(home, filename)
    )
      candidates.add(path.normalize(filename));
  }
  /** @param {string} filename */
  function addConfigured(filename) {
    if (/(?:^|\/)(?:[^/]*cache[^/]*|store|mod)(?:\/|$)/i.test(filename))
      add(filename);
  }
  /** @param {string} directory */
  async function directories(directory) {
    try {
      await checkPath(home, directory);
      return await readdir(directory, { withFileTypes: true });
    } catch {
      return [];
    }
  }
  const [npm, pnpm, go, brew] = await Promise.all([
    query("npm", ["config", "get", "cache"], home),
    query("pnpm", ["store", "path"], home),
    query("go", ["env", "-json", "GOCACHE", "GOMODCACHE"], home),
    query("brew", ["--cache"], home),
  ]);
  // npm's top-level directory also contains logs; select cache contents only.
  for (const directory of new Set([join(".npm"), npm]))
    if (path.isAbsolute(directory)) {
      add(path.join(directory, "_cacache"));
      add(path.join(directory, "_npx"));
    }
  for (const directory of [pnpm, brew])
    if (!directory.includes("\n")) addConfigured(directory);
  try {
    const config = JSON.parse(go);
    for (const key of ["GOCACHE", "GOMODCACHE"])
      if (typeof config[key] === "string") addConfigured(config[key]);
  } catch {
    /* Known cache locations remain available when Go is missing. */
  }
  for (const relative of [
    "Library/pnpm/store",
    ".local/share/pnpm/store",
    ".pnpm-store",
    "go/pkg/mod",
    ".bun/install/cache",
    ".yarn/berry/cache",
    ".yarn/cache",
    ".gradle/caches",
    ".gradle/wrapper/dists",
    ".cargo/registry/cache",
    ".cargo/registry/index",
    ".cargo/git/db",
    ".swiftpm/cache",
    ".android/cache",
  ])
    add(join(relative));
  for (const variable of [
    "PIP_CACHE_DIR",
    "UV_CACHE_DIR",
    "YARN_CACHE_FOLDER",
    "ELECTRON_CACHE",
    "PUPPETEER_CACHE_DIR",
  ]) {
    const directory = process.env[variable];
    if (directory && /cache/i.test(path.basename(directory))) add(directory);
  }
  const roots = [join(".cache"), ...(mac ? [join("Library/Caches")] : [])];
  const xdg = process.env.XDG_CACHE_HOME;
  if (xdg && /cache/i.test(path.basename(xdg)) && inside(home, xdg))
    roots.push(xdg);
  for (const root of roots)
    for (const entry of await directories(root))
      add(path.join(root, entry.name));

  // Select cache folders beside application data, never entire profiles.
  const cacheName =
    /^(?:Caches?|CachedData|CachedExtensionVSIXs|Code Cache|GPUCache|ShaderCache|GrShaderCache|Dawn\w*Cache|GraphiteDawnCache)$/i;
  const support = join(mac ? "Library/Application Support" : ".config");
  for (const app of await directories(support)) {
    if (!app.isDirectory()) continue;
    const directory = path.join(support, app.name);
    for (const entry of await directories(directory))
      if (cacheName.test(entry.name)) add(path.join(directory, entry.name));
  }
  const browsers = mac
    ? [
        "Library/Application Support/Google/Chrome",
        "Library/Application Support/Microsoft Edge",
        "Library/Application Support/BraveSoftware/Brave-Browser",
        "Library/Application Support/Chromium",
        "Library/Application Support/Vivaldi",
      ]
    : [
        ".config/google-chrome",
        ".config/microsoft-edge",
        ".config/BraveSoftware/Brave-Browser",
        ".config/chromium",
        ".config/vivaldi",
      ];
  for (const relative of browsers)
    for (const profile of await directories(join(relative))) {
      if (
        !profile.isDirectory() ||
        !/^(?:Default|Profile \d+|Guest Profile|System Profile)$/.test(
          profile.name,
        )
      )
        continue;
      const directory = path.join(join(relative), profile.name);
      for (const entry of await directories(directory))
        if (cacheName.test(entry.name)) add(path.join(directory, entry.name));
    }
  if (mac) {
    for (const relative of ["Library/Containers", "Library/Group Containers"])
      for (const entry of await directories(join(relative))) {
        if (!entry.isDirectory()) continue;
        const base = path.join(join(relative), entry.name);
        add(
          path.join(
            base,
            relative.endsWith("/Containers")
              ? "Data/Library/Caches"
              : "Library/Caches",
          ),
        );
        if (relative.endsWith("Group Containers"))
          add(path.join(base, "Caches"));
      }
    add(join("Library/Developer/CoreSimulator/Caches"));
    const derived = join("Library/Developer/Xcode/DerivedData");
    for (const entry of await directories(derived)) {
      if (!entry.isDirectory()) continue;
      const directory = path.join(derived, entry.name);
      if (/Cache\.noindex$/.test(entry.name)) add(directory);
      else
        for (const child of await directories(directory))
          if (/^(?:Build|Index\.noindex|\w*Cache\.noindex)$/.test(child.name))
            add(path.join(directory, child.name));
    }
  }
  /** @type {string[]} */
  const existing = [];
  for (const filename of [...candidates].sort()) {
    try {
      await lstat(filename);
      existing.push(filename);
    } catch {
      /* Missing or inaccessible caches are skipped. */
    }
  }
  return existing.filter(
    (filename) =>
      !existing.some(
        (parent) => parent !== filename && inside(parent, filename),
      ),
  );
}

/** Delete what can be deleted; keep unavailable entries and continue.
 * @param {string} home @param {string} target @param {boolean} apply
 */
export async function cleanPath(home, target, apply) {
  const result = {
    path: target,
    status: "skipped",
    removedFiles: 0,
    removedDirectories: 0,
    skipped: 0,
    errors: /** @type {string[]} */ ([]),
  };
  const homeInfo = await lstat(home);
  const pnpm = /(?:^|\/)(?:pnpm|\.pnpm-store)(?:\/|$)/.test(target);
  const goModules =
    /(?:^|\/)pkg\/mod(?:\/|$)/.test(target) ||
    target === process.env.GOMODCACHE;
  /** @param {string} filename @param {boolean} [keepRoot] */
  async function remove(filename, keepRoot = false) {
    let originalMode;
    let originalIdentity;
    try {
      const info = await checkPath(home, filename);
      if (info.dev !== homeInfo.dev || info.uid !== homeInfo.uid)
        throw new Error(
          "Foreign-owned paths and mounted filesystems are preserved.",
        );
      const name = path.basename(filename).toLowerCase();
      if (
        name === "localhistory" ||
        (pnpm && ["links", "projects"].includes(name))
      ) {
        result.skipped++;
        return;
      }
      if (!info.isDirectory() && !info.isFile())
        throw new Error("Non-regular filesystem entries are preserved.");
      if (!apply) {
        result.status = "would-clean";
        return;
      }
      if (info.isDirectory()) {
        if (goModules && !(info.mode & 0o200)) {
          const handle = await open(
            filename,
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            const current = await handle.stat();
            if (current.ino !== info.ino || current.dev !== info.dev)
              throw new Error("Directory changed during cleanup.");
            originalMode = info.mode & 0o7777;
            originalIdentity = { dev: current.dev, ino: current.ino };
            await handle.chmod(originalMode | 0o200);
          } finally {
            await handle.close();
          }
        }
        for (const child of await readdir(filename))
          await remove(path.join(filename, child));
        if (!keepRoot) {
          await checkPath(home, filename);
          await rmdir(filename);
          result.removedDirectories++;
        }
      } else {
        await unlink(filename);
        result.removedFiles++;
      }
    } catch (error) {
      if (!hasCode(error, "ENOENT")) {
        result.skipped++;
        if (!hasCode(error, "ENOTEMPTY"))
          result.errors.push(`${JSON.stringify(filename)}: ${message(error)}`);
      }
    } finally {
      if (originalMode !== undefined) {
        try {
          await checkPath(home, filename);
          const handle = await open(
            filename,
            constants.O_RDONLY | constants.O_NOFOLLOW,
          );
          try {
            const current = await handle.stat();
            if (
              !originalIdentity ||
              current.dev !== originalIdentity.dev ||
              current.ino !== originalIdentity.ino
            )
              // eslint-disable-next-line no-unsafe-finally
              throw new Error(
                "Directory changed before permission restoration.",
              );
            await handle.chmod(originalMode);
          } finally {
            await handle.close();
          }
        } catch (error) {
          if (!hasCode(error, "ENOENT"))
            result.errors.push(
              `Permission restoration failed: ${message(error)}`,
            );
        }
      }
    }
  }
  await remove(target, true);
  if (apply)
    result.status =
      result.removedFiles || result.removedDirectories
        ? result.skipped
          ? "partial"
          : "cleaned"
        : result.skipped
          ? "skipped"
          : "empty";
  return result;
}

/** @param {string} home */
async function freeSpace(home) {
  try {
    const info = await statfs(home);
    return info.bsize * info.bavail;
  } catch {
    return null;
  }
}
/** @param {string[]} [args] */
export async function main(args = process.argv.slice(2)) {
  const options = optionsFrom(args);
  if (options.help) {
    process.stdout.write(
      "Usage: node clean-cache.mjs [--apply | --dry-run] [--json]\n\nPreview is the default. Delete accessible user-cache contents with --apply.\nCache roots and non-cache data are preserved. Unavailable entries are skipped.\nRun without sudo.\n",
    );
    return;
  }
  if (!["darwin", "linux"].includes(process.platform))
    throw new Error("Only macOS and Linux are supported.");
  if (process.geteuid?.() === 0)
    throw new Error("Run as the cache owner without sudo.");
  const home = await realpath(os.homedir());
  if (
    [path.parse(home).root, "/Users", "/home", "/tmp", "/private/tmp"].includes(
      home,
    )
  )
    throw new Error("The home directory is not safe for cache cleanup.");
  if (!options.json)
    process.stdout.write(
      `${options.apply ? "APPLY" : "DRY RUN"}: discovering cache paths.\n`,
    );
  const before = await freeSpace(home);
  const results = [];
  for (const filename of await cachePaths(home)) {
    const result = await cleanPath(home, filename, options.apply);
    results.push(result);
    if (!options.json) {
      process.stdout.write(
        `${result.status.toUpperCase()}: ${JSON.stringify(filename)}${options.apply ? ` | ${result.removedFiles} files removed, ${result.skipped} entries skipped` : ""}\n`,
      );
      for (const error of result.errors)
        process.stderr.write(`SKIPPED: ${error}\n`);
    }
  }
  const after = await freeSpace(home);
  const report = {
    apply: options.apply,
    removedFiles: results.reduce((sum, item) => sum + item.removedFiles, 0),
    skipped: results.reduce((sum, item) => sum + item.skipped, 0),
    freeBefore: before,
    freeAfter: after,
    freeSpaceChange: before === null || after === null ? null : after - before,
    results,
  };
  if (options.json)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else
    process.stdout.write(
      options.apply
        ? `Completed: ${report.removedFiles} files removed; ${report.skipped} entries skipped.\n`
        : "Preview complete. Use --apply to delete cache contents.\n",
    );
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      process.argv.includes("--json")
        ? `${JSON.stringify({ error: message(error) })}\n`
        : `ERROR: ${message(error)}\n`,
    );
    process.exitCode = 1;
  });
}
