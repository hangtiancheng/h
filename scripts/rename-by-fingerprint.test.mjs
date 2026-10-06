import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  fingerprint,
  loadMetadata,
  pickTarget,
  renameFile,
} from "./rename-by-fingerprint.mjs";

const script = fileURLToPath(
  new URL("./rename-by-fingerprint.mjs", import.meta.url),
);
const goScript = fileURLToPath(
  new URL("./rename_by_fingerprint.go", import.meta.url),
);
const hash = (contents) => createHash("md5").update(contents).digest("hex");

async function fixtureDirectory(t) {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "fingerprint-js-")),
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function writeFixture(filename, contents) {
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, contents);
}

function runReport(...args) {
  const result = spawnSync(process.execPath, [script, "--json", ...args], {
    encoding: "utf8",
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stderr, "");
  return JSON.parse(result.stdout);
}

test("cache follows direct renames, duplicate contents and hard links", async (t) => {
  const root = await fixtureDirectory(t);
  const contents = "video bytes";
  for (const [name, data] of Object.entries({
    "a.MP4": contents,
    "b.MP4": contents,
    [`${hash(contents)}.MP4`]: contents,
    "._9月2日.mp4": "dot-prefixed file",
    "nested/video.mkv": "other video",
  }))
    await writeFixture(path.join(root, name), data);
  await link(path.join(root, "a.MP4"), path.join(root, "hard.MP4"));

  const preview = runReport(root, path.join(root, "nested"));
  assert.equal(preview.roots.length, 1);
  assert.equal(preview.totalFiles, 6);
  assert.equal(preview.hashedFiles, 6);
  assert.equal(preview.cachedFiles, 0);
  assert.equal(preview.wouldRename, 5);
  for (const planned of preview.results) {
    await lstat(planned.source);
    await assert.rejects(lstat(planned.target), { code: "ENOENT" });
  }

  const applied = runReport("--apply", root);
  assert.equal(applied.renamed, 5);
  assert.equal(applied.unchanged, 1);
  assert.equal(applied.cachedFiles, 6);
  assert.equal(applied.hashedFiles, 0);
  const cache = await loadMetadata([root]);
  assert.equal(cache.size, 6);
  for (const [index, renamed] of applied.results.entries()) {
    assert.equal(renamed.target, preview.results[index].target);
    assert.equal(path.extname(renamed.source), path.extname(renamed.target));
    assert.equal(hash(await readFile(renamed.target)), renamed.hash);
    assert.equal(cache.get(renamed.target).md5, renamed.hash);
    assert.equal(cache.has(renamed.source), false);
    await assert.rejects(lstat(renamed.source), { code: "ENOENT" });
  }
  const hardLinks = applied.results.filter((result) =>
    ["a.MP4", "b.MP4", "hard.MP4"].includes(path.basename(result.source)),
  );
  const stats = await Promise.all(
    hardLinks.map((result) => lstat(result.target, { bigint: true })),
  );
  assert.equal(stats[0].ino, stats[2].ino);
  assert.notEqual(stats[0].ino, stats[1].ino);
  const repeated = runReport("--apply", root);
  assert.equal(repeated.renamed, 0);
  assert.equal(repeated.unchanged, 6);
  assert.equal(repeated.cachedFiles, 6);
  assert.equal(repeated.hashedFiles, 0);
});

test("same-size edits with restored mtime invalidate cached MD5s", async (t) => {
  const root = await fixtureDirectory(t);
  const source = path.join(root, "nested", "video.mp4");
  await writeFixture(source, "before");
  const fixedTime = 1_700_000_000;
  await utimes(source, fixedTime, fixedTime);
  runReport(root);
  const before = await lstat(source, { bigint: true });
  const warm = runReport(root);
  assert.equal(warm.cachedFiles, 1);
  assert.equal(warm.hashedFiles, 0);
  await writeFile(source, "after!");
  await utimes(source, fixedTime, fixedTime);
  const after = await lstat(source, { bigint: true });
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeNs, before.mtimeNs);
  assert.notEqual(after.ctimeNs, before.ctimeNs);
  const changed = runReport("--apply", root);
  assert.equal(changed.cachedFiles, 0);
  assert.equal(changed.hashedFiles, 1);
  assert.equal(changed.results[0].hash, hash("after!"));
  const repeated = runReport("--apply", root);
  assert.equal(repeated.cachedFiles, 1);
  assert.equal(repeated.hashedFiles, 0);
  assert.equal(repeated.unchanged, 1);
});

test("deleted entries are removed, including the last file", async (t) => {
  const root = await fixtureDirectory(t);
  const first = path.join(root, "first.mp4");
  const second = path.join(root, "second.mp4");
  await writeFixture(first, "first");
  await writeFixture(second, "second");
  runReport(root);
  await unlink(first);
  const remaining = runReport(root);
  assert.equal(remaining.totalFiles, 1);
  assert.equal(remaining.cachedFiles, 1);
  assert.equal(remaining.hashedFiles, 0);
  const cache = await loadMetadata([root]);
  assert.equal(cache.has(first), false);
  assert.equal(cache.size, 1);
  assert.equal(cache.get(second).md5, hash("second"));
  await unlink(second);
  const empty = runReport(root);
  assert.equal(empty.totalFiles, 0);
  assert.equal(empty.hashedFiles, 0);
  assert.equal((await loadMetadata([root])).size, 0);
});

test("invalid metadata is repaired and metadata files are never renamed", async (t) => {
  for (const invalid of [
    "{broken",
    '{"files":{}}',
    '{"files":{"video.mp4":{"md5":"invalid"}}}',
  ]) {
    const root = await fixtureDirectory(t);
    await writeFixture(path.join(root, "video.mp4"), "video");
    await writeFixture(path.join(root, ".meta.json"), invalid);
    await writeFixture(
      path.join(root, ".meta.json-abandoned"),
      "temporary metadata",
    );
    const cold = runReport("--apply", "--no-default-excludes", root);
    assert.equal(cold.totalFiles, 1);
    assert.equal(cold.hashedFiles, 1);
    assert.equal(cold.renamed, 1);
    assert.equal(cold.results[0].hash, hash("video"));
    const warm = runReport("--apply", "--no-default-excludes", root);
    assert.equal(warm.totalFiles, 1);
    assert.equal(warm.hashedFiles, 0);
    assert.equal(warm.cachedFiles, 1);
  }
});

test("destinations created after planning, including dangling symlinks, are preserved", async (t) => {
  const root = await fixtureDirectory(t);
  const source = path.join(root, "video.mp4");
  await writeFixture(source, "video");
  const identities = new Map();
  const value = await fingerprint(source, identities);
  const occupied = new Set([source]);
  const target = await pickTarget(source, value.hash, occupied);
  await writeFixture(target, "concurrent occupant");
  await assert.rejects(renameFile(value, target, identities), {
    code: "EEXIST",
  });
  const dangling = await pickTarget(source, value.hash, occupied);
  await symlink("does-not-exist", dangling);
  await assert.rejects(renameFile(value, dangling, identities), {
    code: "EEXIST",
  });
  const next = await pickTarget(source, value.hash, occupied);
  await renameFile(value, next, identities);
  assert.equal(await readFile(target, "utf8"), "concurrent occupant");
  assert.equal(await readFile(next, "utf8"), "video");
  assert.equal((await lstat(dangling)).isSymbolicLink(), true);
});

test("multiple roots keep independent caches", async (t) => {
  const first = await fixtureDirectory(t);
  const second = await fixtureDirectory(t);
  await writeFixture(path.join(first, "same.mp4"), "first");
  await writeFixture(path.join(second, "same.mp4"), "second");
  const cold = runReport("--apply", first, second);
  assert.equal(cold.renamed, 2);
  assert.equal(cold.hashedFiles, 2);
  const warm = runReport("--apply", first, second);
  assert.equal(warm.unchanged, 2);
  assert.equal(warm.cachedFiles, 2);
  assert.equal(warm.hashedFiles, 0);
  for (const root of [first, second])
    assert.equal((await loadMetadata([root])).size, 1);
});

test("JS and Go reuse each other's metadata without timestamp rounding", async (t) => {
  const root = await fixtureDirectory(t);
  await writeFixture(path.join(root, "video.mp4"), "shared video");
  assert.equal(runReport(root).hashedFiles, 1);
  const result = spawnSync("go", ["run", goScript, "--json", "--apply", root], {
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT") return t.skip("Go is not installed");
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const go = JSON.parse(result.stdout);
  assert.equal(go.cachedFiles, 1);
  assert.equal(go.hashedFiles, 0);
  assert.equal(go.renamed, 1);
  const js = runReport("--apply", root);
  assert.equal(js.cachedFiles, 1);
  assert.equal(js.hashedFiles, 0);
  assert.equal(js.unchanged, 1);
});
