import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import {
  createXCodecDecodeTransform,
  createXCodecEncodeTransform,
} from "../pipeline/index.js";
import { MemoryCache } from "../xcodec/index.js";
import { createHashSink, hashFile } from "./hash-file.js";

export interface XCodecFileVerification {
  readonly decodedSha256: string;
  readonly originalSha256: string;
  readonly verified: boolean;
}

export async function verifyXCodecFile(
  file: string,
  cacheSegments: number,
): Promise<XCodecFileVerification> {
  const originalHash = await hashFile(file);
  const decodedHash = await hashXCodecRoundTrip(file, cacheSegments);
  return {
    decodedSha256: decodedHash,
    originalSha256: originalHash,
    verified: originalHash === decodedHash,
  };
}

async function hashXCodecRoundTrip(
  file: string,
  cacheSegments: number,
): Promise<string> {
  const sink = createHashSink();
  await pipeline(
    createReadStream(file),
    createXCodecEncodeTransform({
      cache: new MemoryCache({ maxSegments: cacheSegments }),
    }),
    createXCodecDecodeTransform({
      cache: new MemoryCache({ maxSegments: cacheSegments }),
    }),
    sink.stream,
  );
  return sink.digest();
}
