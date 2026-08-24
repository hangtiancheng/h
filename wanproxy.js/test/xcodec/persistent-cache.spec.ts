import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  decodeXCodec,
  encodeFrame,
  encodeXCodec,
  PersistentXCodecCache,
  XCODEC_SEGMENT_LENGTH,
  XCodecHash,
} from "@/xcodec/index.js";
import { formatUint64Hex } from "@/xcodec/uint64.js";

function segment(seed: number): Uint8Array {
  return Uint8Array.from(
    { length: XCODEC_SEGMENT_LENGTH },
    (_, index) => (index + seed) & 0xff,
  );
}

async function withTempDirectory<T>(
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "xcodec-cache-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

describe("PersistentXCodecCache", () => {
  it("persists segments and warm-loads them after restart", async () => {
    await withTempDirectory(async (directory) => {
      const bytes = segment(17);
      const hash = XCodecHash.hashSegment(bytes);
      PersistentXCodecCache.open({ directory }).enter(hash, bytes);

      const restarted = PersistentXCodecCache.open({ directory });
      const cached = restarted.lookup(hash);
      expect(cached).toEqual(bytes);
      if (cached === undefined) {
        throw new Error("expected persisted segment");
      }
      cached[0] = 0xff;
      expect(restarted.lookup(hash)).toEqual(bytes);
    });
  });

  it("enables refs to decode after process restart", async () => {
    await withTempDirectory(async (directory) => {
      const bytes = segment(33);
      const hash = XCodecHash.hashSegment(bytes);
      PersistentXCodecCache.open({ directory }).enter(hash, bytes);

      const encoded = encodeXCodec(bytes, {
        cache: PersistentXCodecCache.open({ directory }),
      });
      expect(encoded).toEqual(encodeFrame({ hash, kind: "ref" }));

      const decoded = decodeXCodec(encoded, {
        cache: PersistentXCodecCache.open({ directory }),
      });
      expect(decoded).toEqual({ output: bytes, status: "ok" });
    });
  });

  it("removes short and hash-mismatched cache files during warm-load", async () => {
    await withTempDirectory(async (directory) => {
      const valid = segment(41);
      const validHash = XCodecHash.hashSegment(valid);
      const validName = `${formatUint64Hex(validHash)}.xcs`;
      await writeFile(join(directory, validName), valid);
      await writeFile(
        join(directory, "0000000000000001.xcs"),
        Uint8Array.from([1, 2, 3]),
      );
      await writeFile(join(directory, "0000000000000002.xcs"), segment(99));

      const cache = PersistentXCodecCache.open({ directory });
      expect(cache.lookup(validHash)).toEqual(valid);
      expect(await readdir(directory)).toEqual([validName]);
    });
  });

  it("validates options and segment size", async () => {
    await withTempDirectory(async (directory) => {
      expect(() => PersistentXCodecCache.open({ directory: "" })).toThrow();
      const cache = PersistentXCodecCache.open({ directory, maxSegments: 1 });
      expect(() => cache.enter(1n, Uint8Array.from([1]))).toThrow("2048 bytes");
    });
  });
});
