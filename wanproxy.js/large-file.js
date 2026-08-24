#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { cwd, exit } from "node:process";

const projectRoot = "/Users/bytedance/wanproxy-all/wanproxy-js";

async function main() {
  if (!shouldSkipBuild(process.argv.slice(2), process.env)) {
    ensureBuilt();
  }
  const { parseLargeFileHarnessOptions, runLargeFileHarness } =
    await import("./dist/validation/index.js");
  const options = parseLargeFileHarnessOptions(
    process.argv.slice(2),
    process.env,
    projectRoot,
  );
  await runLargeFileHarness(options);
}

function ensureBuilt() {
  const result = spawnSync("pnpm", ["build"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error("pnpm build failed");
  }
}

function shouldSkipBuild(argv, env) {
  return argv.includes("--skip-build") || env.LARGE_FILE_SKIP_BUILD === "1";
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "unknown large-file verification error",
  );
  console.error(`working directory: ${cwd()}`);
  exit(1);
});
