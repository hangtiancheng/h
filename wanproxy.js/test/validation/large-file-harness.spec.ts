import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  hashFile,
  parseLargeFileHarnessOptions,
  verifyXCodecFile,
} from "../../src/validation/index.js";

async function withTempDirectory<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "large-file-harness-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe("large-file harness", () => {
  it("parses CLI flags and environment defaults", () => {
    const options = parseLargeFileHarnessOptions(
      [
        "--size-gb=2",
        "--file=fixture.bin",
        "--force",
        "--skip-build",
        "--workers=2",
        "--chunk-mib=8",
        "--cache-segments=32",
        "--json",
      ],
      {},
      "/project",
    );

    expect(options).toEqual({
      cacheSegments: 32,
      chunkMiB: 8,
      file: "fixture.bin",
      force: true,
      json: true,
      projectRoot: "/project",
      sizeGB: 2,
      skipBuild: true,
      workers: 2,
    });
  });

  it("rejects unknown and invalid harness options", () => {
    expect(() =>
      parseLargeFileHarnessOptions(["--bad"], {}, "/project"),
    ).toThrow("unknown argument");
    expect(() =>
      parseLargeFileHarnessOptions(["--size-gb=0"], {}, "/project"),
    ).toThrow();
  });

  it("hashes and verifies an XCodec file roundtrip without loading it all", async () => {
    await withTempDirectory(async (directory) => {
      const file = join(directory, "payload.bin");
      const repeated = Buffer.alloc(4096, 0xa5);
      await writeFile(
        file,
        Buffer.concat([Buffer.from("prefix"), repeated, Buffer.from("tail")]),
      );

      const originalHash = await hashFile(file);
      const result = await verifyXCodecFile(file, 8);

      expect(result).toEqual({
        decodedSha256: originalHash,
        originalSha256: originalHash,
        verified: true,
      });
    });
  });
});
