#!/usr/bin/env node
// @ts-check
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat as fileStat,
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

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const METADATA_FILENAME = ".meta.json";
const lstat = (filename) => fileStat(filename, { bigint: true });
const DEFAULT_EXCLUDES = new Set([
  ".DS_Store",
  ".Spotlight-V100",
  ".Trashes",
  ".TemporaryItems",
  ".fseventsd",
  "System Volume Information",
  "$RECYCLE.BIN",
  "node_modules",
  ".git",
  ".ssh",
  ".aws",
  ".gnupg",
  ".codex",
  ".agents",
  "Library",
]);
const message = (error) =>
  error instanceof Error ? error.message : String(error);
const hasCode = (error, code) =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;
const sameFile = (first, second) =>
  first.dev === second.dev &&
  first.ino === second.ino &&
  first.mode === second.mode;
const sameContents = (first, second) =>
  sameFile(first, second) &&
  first.size === second.size &&
  first.mtimeNs === second.mtimeNs &&
  first.ctimeNs === second.ctimeNs;
export function inside(parent, child) {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}
const pathKey = (filename) =>
  ["darwin", "win32"].includes(process.platform)
    ? filename.normalize("NFC").toLowerCase()
    : filename;
async function optionalStat(filename) {
  try {
    return await lstat(filename);
  } catch (error) {
    if (hasCode(error, "ENOENT")) return null;
    throw error;
  }
}

export function optionsFrom(args) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      apply: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      exclude: { type: "string", multiple: true, default: [] },
      "no-default-excludes": { type: "boolean", default: false },
      concurrency: { type: "string", default: "4" },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  if (values.apply && values["dry-run"])
    throw new Error("--apply and --dry-run cannot be combined.");
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
      `  --no-default-excludes   Disable built-in exclusions.\n` +
      `  --concurrency <n>       Fingerprint workers, 1 to 64 (default: 4).\n` +
      `  --json                  Write one JSON report.\n` +
      `  --help, -h              Display this help.\n\n` +
      `Requires Node.js 22+. Each directory argument stores an MD5 cache in\n` +
      `.meta.json, also in preview mode. Unchanged size, modification time and\n` +
      `change time reuse cached MD5s. The cache is shared with the Go version.\n` +
      `Existing destination names and duplicate hashes receive numbered suffixes.\n` +
      `File contents and extension case are preserved. Renames do not need hard links.\n` +
      `Close files before applying and avoid concurrent edits or renames.\n` +
      `Built-in exclusions: ${[...DEFAULT_EXCLUDES].join(", ")}\n` +
      `Exit codes: 0 completed, 1 file or directory errors, 2 invalid usage.\n`,
  );
}

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

function excluded(filename, excludes) {
  return (
    excludes.has(pathKey(path.basename(filename))) ||
    [...excludes].some(
      (item) => path.isAbsolute(item) && inside(item, pathKey(filename)),
    )
  );
}

export async function collectFiles(roots, excludes, identities) {
  const files = [];
  const errors = [];
  let skipped = 0;
  const ownStat = await lstat(SCRIPT_PATH);
  const normalizedExcludes = new Set([...excludes].map(pathKey));
  async function walk(directory) {
    try {
      await checkDirectories(directory, identities);
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      for (const entry of entries) {
        const filename = path.join(directory, entry.name);
        if (
          entry.name === METADATA_FILENAME ||
          entry.name.startsWith(`${METADATA_FILENAME}-`)
        )
          continue;
        if (excluded(filename, normalizedExcludes) || entry.isSymbolicLink()) {
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
    if (excluded(root, normalizedExcludes)) skipped++;
    else await walk(root);
  }
  return { files: [...new Set(files)].sort(), errors, skipped };
}

export async function loadMetadata(roots) {
  const entries = new Map();
  for (const root of roots) {
    let handle;
    try {
      handle = await open(
        path.join(root, METADATA_FILENAME),
        constants.O_RDONLY |
          (constants.O_NOFOLLOW ?? 0) |
          (constants.O_NONBLOCK ?? 0),
      );
      if (!(await handle.stat()).isFile()) continue;
      const stored = JSON.parse(
        await handle.readFile("utf8"),
        (key, value, context) => {
          if (
            ["size", "mtimeNs", "ctimeNs"].includes(key) &&
            typeof value === "number"
          ) {
            if (context?.source) return BigInt(context.source);
            if (Number.isSafeInteger(value)) return BigInt(value);
          }
          return value;
        },
      );
      if (
        !stored?.files ||
        typeof stored.files !== "object" ||
        Array.isArray(stored.files)
      )
        continue;
      for (const [name, entry] of Object.entries(stored.files)) {
        const filename = path.resolve(root, name);
        if (
          name &&
          !path.isAbsolute(name) &&
          filename !== root &&
          inside(root, filename)
        )
          entries.set(filename, entry);
      }
    } catch {
    } finally {
      await handle?.close();
    }
  }
  return entries;
}

async function fingerprintFromCache(file, entry, identities) {
  if (
    !entry ||
    typeof entry.md5 !== "string" ||
    !/^[a-f0-9]{32}$/.test(entry.md5)
  )
    return null;
  try {
    await checkDirectories(path.dirname(file), identities);
    const info = await lstat(file);
    if (
      info.isFile() &&
      info.size === entry.size &&
      info.mtimeNs === entry.mtimeNs &&
      info.ctimeNs === entry.ctimeNs
    )
      return { file, hash: entry.md5, stat: info };
  } catch {}
  return null;
}

const inodeKey = (info) => `${info.dev}:${info.ino}`;

async function saveMetadata(root, values, inodeStates, identities) {
  await checkDirectories(root, identities);
  const files = Object.create(null);
  for (const value of values) {
    if (!inside(root, value.file)) continue;
    const expected = inodeStates.get(inodeKey(value.stat)) ?? value.stat;
    const current = await lstat(value.file).catch(() => null);
    if (!current || !sameContents(expected, current)) continue;
    files[path.relative(root, value.file)] = {
      md5: value.hash,
      size: current.size,
      mtimeNs: current.mtimeNs,
      ctimeNs: current.ctimeNs,
    };
  }
  const temporary = path.join(root, `${METADATA_FILENAME}-${randomUUID()}`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    try {
      await handle.writeFile(
        `${JSON.stringify(
          { files },
          (_key, value) =>
            typeof value === "bigint" ? JSON.rawJSON(value.toString()) : value,
          2,
        )}\n`,
      );
    } finally {
      await handle.close();
    }
    await rename(temporary, path.join(root, METADATA_FILENAME));
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

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
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || !sameContents(expected, before))
      throw new Error("File changed before hashing.");
    const hash = createHash("md5");
    for await (const chunk of handle.createReadStream({ autoClose: false }))
      hash.update(chunk);
    const after = await handle.stat({ bigint: true });
    await checkDirectories(path.dirname(file), identities);
    if (!sameContents(before, after) || !sameContents(after, await lstat(file)))
      throw new Error("File changed during hashing.");
    return { file, hash: hash.digest("hex"), stat: after };
  } finally {
    await handle.close();
  }
}

export async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
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

export function alreadyNamed(source, hash) {
  const base = path.basename(source, path.extname(source));
  return (
    base === hash ||
    (base.startsWith(`${hash}-`) &&
      /^[1-9]\d*$/.test(base.slice(hash.length + 1)))
  );
}
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

export async function renameFile(
  original,
  target,
  identities,
  inodeStates = new Map(),
) {
  const source = original.file;
  if (path.dirname(source) !== path.dirname(target))
    throw new Error("Destination must be in the source directory.");
  await checkDirectories(path.dirname(source), identities);
  const inode = inodeKey(original.stat);
  const expected = inodeStates.get(inode) ?? original.stat;
  const before = await lstat(source);
  if (!before.isFile() || !sameContents(expected, before))
    throw new Error("File changed after fingerprinting.");
  if (await optionalStat(target))
    throw Object.assign(new Error("Destination already exists."), {
      code: "EEXIST",
    });
  await rename(source, target);
  inodeStates.set(inode, await lstat(target));
}

export { renameFile as moveWithoutOverwrite };

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
  const errors = [];
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
  const collected = await collectFiles(roots, excludes, identities);
  errors.push(...collected.errors);
  const cacheRoots = roots.filter((root) => !excluded(root, excludes));
  const cache = await loadMetadata(cacheRoots);
  const fingerprints = await mapPool(
    collected.files,
    options.concurrency,
    async (file) => {
      const value = await fingerprintFromCache(
        file,
        cache.get(file),
        identities,
      );
      return {
        file,
        value: value ?? undefined,
      };
    },
  );
  const pending = fingerprints.filter((result) => !result.value);
  const cachedFiles = fingerprints.length - pending.length;
  if (!options.json)
    process.stdout.write(
      `CACHE: ${cachedFiles}/${collected.files.length} files reused.\n` +
        `HASHING: ${pending.length} regular files.\n`,
    );
  await mapPool(pending, options.concurrency, async (result) => {
    try {
      result.value = await fingerprint(result.file, identities);
    } catch (error) {
      result.error = `${JSON.stringify(result.file)}: ${message(error)}`;
    }
  });
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
      unchanged++;
      continue;
    }
    const source = value.file;
    let target = "";
    try {
      target = await pickTarget(value.file, value.hash, occupied);
      if (options.apply) {
        for (;;) {
          try {
            await renameFile(value, target, identities, inodeStates);
            break;
          } catch (error) {
            if (!hasCode(error, "EEXIST")) throw error;
            target = await pickTarget(value.file, value.hash, occupied);
          }
        }
      }
      if (options.apply) value.file = target;
      results.push({
        source,
        target,
        hash: value.hash,
        status: options.apply ? "renamed" : "would-rename",
      });
      if (!options.json)
        process.stdout.write(
          `${options.apply ? "RENAMED" : "WOULD RENAME"}: ${JSON.stringify(source)} -> ${JSON.stringify(target)}\n`,
        );
    } catch (error) {
      errors.push(
        `${JSON.stringify(source)} -> ${JSON.stringify(target)}: ${message(error)}`,
      );
    }
  }
  const values = fingerprints.flatMap((result) =>
    result.value ? [result.value] : [],
  );
  for (const root of cacheRoots) {
    try {
      await saveMetadata(root, values, inodeStates, identities);
    } catch (error) {
      errors.push(
        `${JSON.stringify(path.join(root, METADATA_FILENAME))}: ${message(error)}`,
      );
    }
  }
  const report = {
    apply: options.apply,
    roots,
    totalFiles: collected.files.length,
    cachedFiles,
    hashedFiles: pending.length,
    renamed: options.apply ? results.length : 0,
    wouldRename: options.apply ? 0 : results.length,
    unchanged,
    skipped: collected.skipped,
    failures: errors.length,
    results,
    errors,
  };
  if (options.json)
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    for (const error of errors) process.stderr.write(`SKIPPED: ${error}\n`);
    process.stdout.write(
      `Completed: ${results.length} ${options.apply ? "renamed" : "planned"}, ${unchanged} unchanged, ${errors.length} errors.\n`,
    );
    if (!options.apply && results.length)
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
