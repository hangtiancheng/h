import { ByteQueue } from "../xcodec/byte-queue.js";
import { XCODEC_MAGIC } from "../xcodec/constants.js";
import { readRawPrefix } from "../xcodec/decoder-state.js";
import { readFrame } from "../xcodec/frame-codec.js";
import { XCodecHash } from "../xcodec/hash.js";
import type { MemoryCache } from "../xcodec/memory-cache.js";

export function collectUnknownReferences(
  payload: Uint8Array,
  cache: MemoryCache,
): readonly bigint[] {
  const queue = new ByteQueue();
  queue.append(payload);
  const unknown = new Set<bigint>();
  const defined = new Set<bigint>();

  while (queue.length > 0) {
    const raw = readRawPrefix(queue);
    if (raw !== undefined) {
      continue;
    }
    if (queue.length === 1 && queue.peek(0) === XCODEC_MAGIC) {
      break;
    }
    const result = readFrame(queue);
    if (result.status !== "frame") {
      break;
    }
    if (result.frame.kind === "extract") {
      defined.add(XCodecHash.hashSegment(result.frame.segment));
      continue;
    }
    if (
      result.frame.kind === "ref" &&
      !cache.has(result.frame.hash) &&
      !defined.has(result.frame.hash)
    ) {
      unknown.add(result.frame.hash);
    }
  }
  return [...unknown];
}
