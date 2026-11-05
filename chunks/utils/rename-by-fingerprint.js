#!/usr/bin/env node
// @ts-check
/**
 * Rename regular files recursively to <lowercase MD5><original extension>.
 * Preview by default; --apply performs the changes. Extension case is kept.
 * Hidden entries (names starting with ".") are skipped unless --include-hidden
 * is given; explicitly named roots are always processed. AppleDouble metadata
 * (files named "._<original>") written by macOS on exFAT/FAT volumes is never
 * renamed; --clean-apple-double removes orphaned or previously misfiled copies.
 * Existing names, duplicate contents, and MD5 collisions receive numeric
 * suffixes; no file is deduplicated or overwritten. Valid fingerprint names,
 * including numbered suffixes, are unchanged on subsequent runs.
 *
 * A hard link reserves each destination without replacing an existing entry.
 * Filesystems without hard links (exFAT, FAT, SMB) fall back to rename only
 * after the destination is verified absent; POSIX rename cannot exclude a
 * concurrent creator, so that check is not race-free. The source is removed
 * only after both names and the inspected file identity have been verified.
 * An interrupted operation may leave both names pointing to the same file.
 * Avoid concurrent edits while renaming; portable Node.js cannot provide
 * an atomic, conditional unlink against an unrelated writer.
 *
 * Usage: node rename-by-fingerprint.mjs [options] [directory...]
 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  link,
  lstat,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

/** @typedef {import('node:fs').Stats} Stats */
/** @typedef {{file: string, hash: string, stat: Stats}} Fingerprint */
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_EXCLUDES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".TemporaryItems",
  ".fseventsd",
  "System Volume Information",
  "$RECYCLE.BIN",
  "Thumbs.db",
  "desktop.ini",
  "lost+found",
  "node_modules",
  ".git",
  ".ssh",
  ".aws",
  ".gnupg",
  ".codex",
  ".agents",
  "Library",
]);
/** @param {string} name */
const isHidden = (name) => name.startsWith(".");
/** @param {string} name */
const isCompanion = (name) => name.startsWith("._");
const COMPANION_PREFIX = "._";
const APPLE_DOUBLE_HEADER = Buffer.from(
  "00051607000200004d6163204f532058",
  "hex",
);
/** @param {unknown} error */
const message = (error) =>
  error instanceof Error ? error.message : String(error);
/** @param {unknown} error @param {string} code */
const hasCode = (error, code) =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;
/** @param {Stats} first @param {Stats} second */
const sameFile = (first, second) =>
  first.dev === second.dev &&
  first.ino === second.ino &&
  first.mode === second.mode;
/** @param {Stats} first @param {Stats} second */
const sameContents = (first, second) =>
  sameFile(first, second) &&
  first.size === second.size &&
  first.mtimeMs === second.mtimeMs &&
  first.ctimeMs === second.ctimeMs;
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
/** Reserve conservatively on platforms that commonly use case-insensitive filesystems.
 * @param {string} filename
 */
const pathKey = (filename) =>
  ["darwin", "win32"].includes(process.platform)
    ? filename.normalize("NFC").toLowerCase()
    : filename;
/** @param {string} filename */
async function optionalStat(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
}

/** @param {string[]} args */
export function optionsFrom(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      apply: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      exclude: { type: "string", multiple: true, default: [] },
      "include-hidden": { type: "boolean", default: false },
      "include-apple-double": { type: "boolean", default: false },
      "clean-apple-double": { type: "boolean", default: false },
      "no-default-excludes": { type: "boolean", default: false },
      concurrency: { type: "string", default: "4" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.apply && values["dry-run"])
    throw new Error("--apply and --dry-run cannot be combined.");
  if (values["include-apple-double"] && values["clean-apple-double"])
    throw new Error(
      "--include-apple-double and --clean-apple-double cannot be combined.",
    );
  if (!/^[1-9]\d*$/.test(values.concurrency) || Number(values.concurrency) > 64)
    throw new Error("--concurrency must be an integer from 1 to 64.");
  if (values.exclude.some((item) => !item.trim()))
    throw new Error("--exclude requires a nonempty name or path.");
  if (values.apply && !positionals.length && !values.help)
    throw new Error("--apply requires an explicit directory.");
  return {
    ...values,
    concurrency: Number(values.concurrency),
    roots: positionals,
  };
}
function printHelp() {
  process.stdout.write(
    `Rename files recursively to their MD5 fingerprint, preserving extensions.\n\n` +
      `Usage: node rename-by-fingerprint.mjs [options] [directory...]\n\n` +
      `  --apply                 Perform renames; requires an explicit directory.\n` +
      `  --dry-run               Preview only (default; current directory if omitted).\n` +
      `  --exclude <name|path>   Exclude an entry name or path; repeatable.\n` +
      `  --include-hidden        Also process entries whose names start with ".".\n` +
      `  --include-apple-double  Also process macOS "._<name>" metadata files.\n` +
      `  --clean-apple-double    Remove orphaned or misfiled AppleDouble copies.\n` +
      `  --no-default-excludes   Disable built-in exclusions.\n` +
      `  --concurrency <n>       Fingerprint workers, 1 to 64 (default: 4).\n` +
      `  --json                  Write one JSON report.\n` +
      `  --help, -h              Display this help.\n\n` +
      `Existing files and symbolic links are never overwritten. Duplicate hashes\n` +
      `receive numbered suffixes. File contents and extension case are preserved.\n` +
      `AppleDouble metadata is skipped by default; --clean-apple-double (with\n` +
      `--apply) deletes companions whose base file is gone and fingerprint-named\n` +
      `copies left behind by older versions of this script.\n` +
      `Close files before applying. Hard links reserve destinations when the\n` +
      `filesystem supports them; exFAT/FAT volumes use a checked rename.\n` +
      `Built-in exclusions: ${[...DEFAULT_EXCLUDES].join(", ")}\n` +
      `Exit codes: 0 completed, 1 file or directory errors, 2 invalid usage.\n`,
  );
}

/** Recheck directory identities to avoid following replaced directory entries.
 * @param {string} directory @param {Map<string, Stats>} identities
 */
export async function checkDirectories(directory, identities) {
  const chain = [];
  for (let current = directory; ; current = path.dirname(current)) {
    chain.push(current);
    if (path.dirname(current) === current) break;
  }
  for (const current of chain.reverse()) {
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error(
        `Directory is no longer a regular directory: ${JSON.stringify(current)}`,
      );
    const previous = identities.get(current);
    if (previous && !sameFile(previous, info))
      throw new Error(
        `Directory changed during processing: ${JSON.stringify(current)}`,
      );
    identities.set(current, info);
  }
}

/** @param {string[]} roots @param {Set<string>} excludes @param {Map<string, Stats>} identities
 * @param {boolean} [includeHidden] @param {boolean} [includeAppleDouble]
 */
export async function collectFiles(
  roots,
  excludes,
  identities,
  includeHidden = false,
  includeAppleDouble = false,
) {
  const files = /** @type {string[]} */ ([]);
  const companions = /** @type {string[]} */ ([]);
  const errors = /** @type {string[]} */ ([]);
  let skipped = 0;
  const ownStat = await lstat(SCRIPT_PATH);
  const normalizedExcludes = new Set([...excludes].map(pathKey));
  const excluded = (/** @type {string} */ filename) =>
    normalizedExcludes.has(pathKey(path.basename(filename))) ||
    [...normalizedExcludes].some(
      (item) => path.isAbsolute(item) && inside(item, pathKey(filename)),
    );
  /** @param {string} directory */
  async function walk(directory) {
    try {
      await checkDirectories(directory, identities);
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        const filename = path.join(directory, entry.name);
        if (excluded(filename) || entry.isSymbolicLink()) {
          skipped++;
          continue;
        }
        if (entry.isFile() && isCompanion(entry.name)) {
          companions.push(filename);
          if (!includeAppleDouble) {
            skipped++;
            continue;
          }
        } else if (!includeHidden && isHidden(entry.name)) {
          skipped++;
          continue;
        }
        if (entry.isDirectory()) await walk(filename);
        else if (entry.isFile()) {
          try {
            await checkDirectories(directory, identities);
            const info = await lstat(filename);
            if (!info.isFile() || sameFile(ownStat, info)) {
              skipped++;
              continue;
            }
            files.push(filename);
          } catch (error) {
            errors.push(`${JSON.stringify(filename)}: ${message(error)}`);
          }
        } else skipped++;
      }
    } catch (error) {
      errors.push(`${JSON.stringify(directory)}: ${message(error)}`);
    }
  }
  for (const root of roots) {
    if (excluded(root)) skipped++;
    else await walk(root);
  }
  return {
    files: [...new Set(files)].sort(),
    companions: [...new Set(companions)].sort(),
    errors,
    skipped,
  };
}

/** Stream through an open, non-symlink file and reject changes during hashing.
 * @param {string} file @param {Map<string, Stats>} identities
 * @returns {Promise<Fingerprint>}
 */
export async function fingerprint(file, identities) {
  await checkDirectories(path.dirname(file), identities);
  const expected = await lstat(file);
  if (!expected.isFile())
    throw new Error("Only regular files can be fingerprinted.");
  const handle = await open(
    file,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const before = await handle.stat();
    if (!before.isFile() || !sameContents(expected, before))
      throw new Error("File changed before hashing.");
    const hash = createHash("md5");
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hash.update(chunk);
    const after = await handle.stat();
    await checkDirectories(path.dirname(file), identities);
    if (!sameContents(before, after) || !sameContents(after, await lstat(file)))
      throw new Error("File changed during hashing.");
    return { file, hash: hash.digest("hex"), stat: after };
  } finally {
    await handle.close();
  }
}

/** @template T, R @param {T[]} items @param {number} limit @param {(item: T) => Promise<R>} worker */
export async function mapPool(items, limit, worker) {
  const results = /** @type {R[]} */ (new Array(items.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await worker(items[index]);
      }
    }),
  );
  return results;
}

/** @param {string} source @param {string} hash */
export function alreadyNamed(source, hash) {
  const base = path.basename(source, path.extname(source));
  return (
    base === hash ||
    (base.startsWith(`${hash}-`) &&
      /^[1-9]\d*$/.test(base.slice(hash.length + 1)))
  );
}
/** lstat treats dangling symlinks as occupied destinations.
 * @param {string} source @param {string} hash @param {Set<string>} occupied
 */
export async function pickTarget(source, hash, occupied) {
  const extension = path.extname(source);
  for (let suffix = 0; ; suffix++) {
    const target = path.join(
      path.dirname(source),
      `${hash}${suffix ? `-${suffix}` : ""}${extension}`,
    );
    if (!occupied.has(pathKey(target)) && !(await optionalStat(target))) {
      occupied.add(pathKey(target));
      return target;
    }
  }
}

/** Filesystems that reject hard links, such as exFAT, FAT, and many SMB mounts. */
const LINK_UNSUPPORTED = new Set(["ENOTSUP", "EOPNOTSUPP", "ENOSYS"]);

/** Reserve a destination without overwriting, then remove the verified source.
 * @param {Fingerprint} original @param {string} target @param {Map<string, Stats>} identities
 * @param {Map<string, Stats>} inodeStates
 */
export async function moveWithoutOverwrite(
  original,
  target,
  identities,
  inodeStates = new Map(),
) {
  const source = original.file;
  if (path.dirname(source) !== path.dirname(target))
    throw new Error("Destination must be in the source directory.");
  await checkDirectories(path.dirname(source), identities);
  const inode = `${original.stat.dev}:${original.stat.ino}`;
  const expected = inodeStates.get(inode) ?? original.stat;
  const before = await lstat(source);
  if (!before.isFile() || !sameContents(expected, before))
    throw new Error("File changed after fingerprinting.");
  try {
    await link(source, target);
  } catch (error) {
    if (![...LINK_UNSUPPORTED].some((code) => hasCode(error, code)))
      throw error;
    await renameUnreserved(before, source, target, identities);
    inodeStates.set(inode, await lstat(target));
    return;
  }
  try {
    await checkDirectories(path.dirname(source), identities);
    const [currentSource, currentTarget] = await Promise.all([
      lstat(source),
      lstat(target),
    ]);
    if (
      !sameFile(before, currentSource) ||
      !sameFile(before, currentTarget) ||
      currentSource.size !== before.size ||
      currentSource.mtimeMs !== before.mtimeMs ||
      currentSource.ctimeMs !== currentTarget.ctimeMs
    )
      throw new Error("File changed while reserving the destination.");
    await unlink(source);
    inodeStates.set(inode, await lstat(target));
  } catch (error) {
    // Roll back only our own extra link while the original still exists.
    try {
      await checkDirectories(path.dirname(source), identities);
      const [left, right] = await Promise.all([
        optionalStat(source),
        optionalStat(target),
      ]);
      if (left && right && sameFile(before, left) && sameFile(before, right))
        await unlink(target);
    } catch {
      /* Preserve both names when rollback cannot be verified. */
    }
    throw error;
  }
}

/** Rename only when the destination is absent; rename itself cannot be exclusive.
 * @param {Stats} before @param {string} source @param {string} target
 * @param {Map<string, Stats>} identities
 */
async function renameUnreserved(before, source, target, identities) {
  if (await optionalStat(target))
    throw Object.assign(new Error("Destination already exists."), {
      code: "EEXIST",
    });
  await rename(source, target);
  await checkDirectories(path.dirname(source), identities);
  const after = await lstat(target);
  if (
    !sameFile(before, after) ||
    before.size !== after.size ||
    before.mtimeMs !== after.mtimeMs ||
    (await optionalStat(source))
  )
    throw new Error("File changed while renaming.");
}

/** Detect the AppleDouble v2 header macOS writes as "._<name>" on exFAT/FAT.
 * @param {string} file
 */
export async function isAppleDouble(file) {
  const handle = await open(
    file,
    constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0),
  );
  try {
    const header = Buffer.alloc(APPLE_DOUBLE_HEADER.length);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length && header.equals(APPLE_DOUBLE_HEADER);
  } finally {
    await handle.close();
  }
}
/** @param {string} file */
export const companionOf = (file) =>
  path.join(path.dirname(file), `${COMPANION_PREFIX}${path.basename(file)}`);
/** @param {string} companion */
export const baseOfCompanion = (companion) =>
  path.join(path.dirname(companion), path.basename(companion).slice(2));

/** Keep AppleDouble metadata attached to a renamed file.
 * @param {string} source @param {string} target
 */
export async function moveCompanion(source, target) {
  const from = companionOf(source);
  const to = companionOf(target);
  if (!(await optionalStat(from)) || (await optionalStat(to))) return false;
  await rename(from, to);
  return true;
}

/** @param {string} file @param {Stats} expected */
async function removeVerified(file, expected) {
  const current = await lstat(file);
  if (!current.isFile() || !sameContents(expected, current))
    throw new Error("File changed before removal.");
  await unlink(file);
}

/** @param {string[]} [args] */
export async function main(args = process.argv.slice(2)) {
  let options;
  try {
    options = optionsFrom(args);
  } catch (error) {
    process.stderr.write(
      args.includes("--json")
        ? `${JSON.stringify({ error: message(error), exitCode: 2 })}\n`
        : `ERROR: ${message(error)}\n`,
    );
    return 2;
  }
  if (options.help) {
    printHelp();
    return 0;
  }
  const errors = /** @type {string[]} */ ([]);
  const identities = new Map();
  const resolved = [];
  for (const directory of options.roots.length
    ? options.roots
    : [process.cwd()]) {
    try {
      const absolute = path.resolve(directory);
      const info = await lstat(absolute);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error("Expected a regular directory, not a symbolic link.");
      const root = await realpath(absolute);
      if (
        options.apply &&
        (root === path.parse(root).root ||
          root === (await realpath(os.homedir())))
      )
        throw new Error(
          "Applying to the filesystem root or entire home directory is not allowed.",
        );
      await checkDirectories(root, identities);
      resolved.push(root);
    } catch (error) {
      errors.push(`${JSON.stringify(directory)}: ${message(error)}`);
    }
  }
  const unique = [...new Set(resolved)].sort();
  const roots = unique.filter(
    (root) => !unique.some((parent) => parent !== root && inside(parent, root)),
  );
  if (!roots.length) errors.push("No valid directories to process.");
  const excludes = new Set(
    options["no-default-excludes"] ? [] : [...DEFAULT_EXCLUDES].map(pathKey),
  );
  for (const item of options.exclude)
    excludes.add(
      pathKey(
        item.includes("/") || item.includes("\\")
          ? path.resolve(
              item.startsWith("~/")
                ? path.join(os.homedir(), item.slice(2))
                : item,
            )
          : item,
      ),
    );
  if (!options.json)
    process.stdout.write(
      `${options.apply ? "APPLY" : "DRY RUN"}: ${roots.map((root) => JSON.stringify(root)).join(", ")}\n`,
    );
  const collected = await collectFiles(
    roots,
    excludes,
    identities,
    options["include-hidden"],
    options["include-apple-double"],
  );
  errors.push(...collected.errors);
  const clean = options["clean-apple-double"];
  const removals = /** @type {object[]} */ ([]);
  const reported = new Set();
  const protectedCompanions = new Set();
  const sweepOrphans = async () => {
    for (const companion of collected.companions) {
      try {
        if (reported.has(companion)) continue;
        if (protectedCompanions.has(companion)) continue;
        if (!(await optionalStat(companion))) continue;
        if (await optionalStat(baseOfCompanion(companion))) continue;
        if (!(await isAppleDouble(companion))) continue;
        if (options.apply) await unlink(companion);
        reported.add(companion);
        removals.push({
          source: companion,
          reason: "orphaned AppleDouble metadata",
          status: options.apply ? "removed" : "would-remove",
        });
        if (!options.json)
          process.stdout.write(
            `${options.apply ? "REMOVED" : "WOULD REMOVE"}: ${JSON.stringify(companion)} (orphaned AppleDouble metadata)\n`,
          );
      } catch (error) {
        errors.push(`${JSON.stringify(companion)}: ${message(error)}`);
      }
    }
  };
  if (clean) await sweepOrphans();
  if (!options.json)
    process.stdout.write(`HASHING: ${collected.files.length} regular files.\n`);
  const fingerprints = await mapPool(
    collected.files,
    options.concurrency,
    async (file) => {
      try {
        return { value: await fingerprint(file, identities) };
      } catch (error) {
        return { error: `${JSON.stringify(file)}: ${message(error)}` };
      }
    },
  );
  const occupied = new Set(collected.files.map(pathKey));
  const inodeStates = new Map();
  const results = [];
  let unchanged = 0;
  for (const result of fingerprints) {
    if (result.error) {
      errors.push(result.error);
      continue;
    }
    const value = result.value;
    if (!value) continue;
    if (alreadyNamed(value.file, value.hash)) {
      let junk = false;
      if (clean) {
        try {
          junk = await isAppleDouble(value.file);
        } catch (error) {
          errors.push(`${JSON.stringify(value.file)}: ${message(error)}`);
          continue;
        }
      }
      if (junk) {
        try {
          if (options.apply) await removeVerified(value.file, value.stat);
          removals.push({
            source: value.file,
            reason: "AppleDouble metadata renamed by an older run",
            status: options.apply ? "removed" : "would-remove",
          });
          if (!options.json)
            process.stdout.write(
              `${options.apply ? "REMOVED" : "WOULD REMOVE"}: ${JSON.stringify(value.file)} (misfiled AppleDouble metadata)\n`,
            );
        } catch (error) {
          errors.push(`${JSON.stringify(value.file)}: ${message(error)}`);
        }
        continue;
      }
      unchanged++;
      continue;
    }
    let target = "";
    try {
      target = await pickTarget(value.file, value.hash, occupied);
      if (options.apply) {
        for (;;) {
          try {
            await moveWithoutOverwrite(value, target, identities, inodeStates);
            break;
          } catch (error) {
            if (!hasCode(error, "EEXIST")) throw error;
            target = await pickTarget(value.file, value.hash, occupied);
          }
        }
        await moveCompanion(value.file, target).catch((error) => {
          protectedCompanions.add(companionOf(value.file));
          errors.push(
            `${JSON.stringify(companionOf(value.file))}: ${message(error)}`,
          );
        });
      }
      results.push({
        source: value.file,
        target,
        hash: value.hash,
        status: options.apply ? "renamed" : "would-rename",
      });
      if (!options.json)
        process.stdout.write(
          `${options.apply ? "RENAMED" : "WOULD RENAME"}: ${JSON.stringify(value.file)} -> ${JSON.stringify(target)}\n`,
        );
    } catch (error) {
      errors.push(
        `${JSON.stringify(value.file)} -> ${JSON.stringify(target)}: ${message(error)}`,
      );
    }
  }
  if (clean) await sweepOrphans();
  const renamed = options.apply
    ? results.filter((item) => item.status === "renamed").length
    : 0;
  const report = {
    apply: options.apply,
    roots,
    totalFiles: collected.files.length,
    renamed,
    wouldRename: options.apply ? 0 : results.length,
    unchanged,
    skipped: collected.skipped,
    appleDoubleSkipped: options["include-apple-double"]
      ? 0
      : collected.companions.length,
    removals,
    failures: errors.length,
    results,
    errors,
  };
  if (options.json)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    for (const error of errors) process.stderr.write(`SKIPPED: ${error}\n`);
    process.stdout.write(
      `Completed: ${results.length} ${options.apply ? "renamed" : "planned"}, ${unchanged} unchanged, ${removals.length} ${options.apply ? "removed" : "to remove"}, ${errors.length} errors.\n`,
    );
    if (
      collected.companions.length &&
      !options["include-apple-double"] &&
      !clean
    )
      process.stdout.write(
        `Skipped ${collected.companions.length} AppleDouble metadata file(s); use --clean-apple-double to remove stale ones.\n`,
      );
    if (!options.apply && (results.length || removals.length))
      process.stdout.write(
        "Preview only. Use --apply with an explicit directory to perform the renames.\n",
      );
  }
  return errors.length ? 1 : 0;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      process.stderr.write(
        process.argv.includes("--json")
          ? `${JSON.stringify({ error: message(error) })}\n`
          : `ERROR: ${message(error)}\n`,
      );
      process.exitCode = 1;
    });
}
