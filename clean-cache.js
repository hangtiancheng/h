#!/usr/bin/env node
/** Clean safe-to-remove caches under ~/Library/Caches. */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CACHES_DIR = path.join(os.homedir(), "Library", "Caches");

/** @type {readonly string[]} */
const SAFE_TO_CLEAN = [
  "go-build",
  "ms-playwright",
  "ms-playwright-go",
  "com.microsoft.VSCode.ShipIt",
  "com.qoder.ide.ShipIt",
  "com.google.antigravity.ShipIt",
  "electron",
  "electron-builder",
  "Cypress",
  "deno",
  "node-gyp",
  "goimports",
  "gopls",
  "typescript",
  "pip",
  "ollama",
  "antigravity-updater",
  "qoder-work-updater",
  "OTFileCache",
  "Google",
  "Microsoft Edge",
  "Qianwen",
  "itpigeon",
  "dd.work.exclusive4aliding",
];

/**
 * @param {string} target
 * @returns {number} size in bytes
 */
function dirSize(target) {
  try {
    const out = execFileSync("du", ["-sk", target], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    return Number.parseInt(out.toString().split(/\s+/)[0], 10) * 1024;
  } catch {
    return 0;
  }
}

/**
 * @param {number} size
 * @returns {string}
 */
function human(size) {
  for (const unit of ["B", "KB", "MB", "GB"]) {
    if (size < 1024) return `${size.toFixed(1)}${unit}`;
    size /= 1024;
  }
  return `${size.toFixed(1)}TB`;
}

function main() {
  let totalFreed = 0;
  /** @type {Array<[string, number]>} */
  const cleaned = [];
  /** @type {Array<[string, string]>} */
  const skipped = [];

  for (const name of SAFE_TO_CLEAN) {
    const target = path.join(CACHES_DIR, name);
    if (!fs.existsSync(target)) {
      skipped.push([name, "not found"]);
      continue;
    }

    const size = dirSize(target);
    try {
      const stat = fs.lstatSync(target);
      if (stat.isDirectory())
        fs.rmSync(target, { recursive: true, force: true });
      else fs.rmSync(target, { force: true });
      fs.mkdirSync(target, { recursive: true });
      totalFreed += size;
      cleaned.push([name, size]);
      console.log(`  cleaned  ${human(size).padStart(10)}  ${name}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      skipped.push([name, reason]);
      console.log(`  SKIPPED  ${name} (${reason})`);
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`Cleaned ${cleaned.length} caches, freed ${human(totalFreed)}`);
  if (skipped.length > 0) {
    console.log(
      `Skipped ${skipped.length}: ${skipped.map(([name]) => name).join(", ")}`,
    );
  }
}

main();
