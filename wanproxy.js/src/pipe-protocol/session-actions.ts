import { XCODEC_SEGMENT_LENGTH } from "../xcodec/constants.js";
import { XCodecHash } from "../xcodec/hash.js";
import type { MemoryCache } from "../xcodec/memory-cache.js";
import { encodePipeFrame } from "./control-frame.js";
import type { ReferenceRetention } from "./reference-retention.js";
import {
  type CodecSessionReceiveResult,
  invalid,
  ok,
} from "./session-result.js";

export function answerAsk(
  retention: ReferenceRetention,
  hashes: readonly bigint[],
): CodecSessionReceiveResult {
  try {
    const segments = retention.learn(hashes);
    return {
      output: new Uint8Array(),
      responses: encodePipeFrame({ kind: "learn", segments }),
      status: "ok",
    };
  } catch (error) {
    return invalid(
      error instanceof Error ? error.message : "failed to answer ASK",
    );
  }
}

export function applyLearnSegments(
  cache: MemoryCache,
  unknownHashes: Set<bigint>,
  segments: readonly Uint8Array[],
): CodecSessionReceiveResult {
  for (const segment of segments) {
    if (segment.length !== XCODEC_SEGMENT_LENGTH) {
      return invalid("invalid LEARN segment length");
    }
    const hash = XCodecHash.hashSegment(segment);
    if (!unknownHashes.has(hash)) {
      return invalid("gratuitous LEARN without ASK");
    }
    if (cache.has(hash)) {
      cache.replace(hash, segment);
    } else {
      cache.enter(hash, segment);
    }
    unknownHashes.delete(hash);
  }
  return ok();
}

export function applyAdvance(
  retention: ReferenceRetention,
  count: number,
): CodecSessionReceiveResult {
  try {
    retention.advance(count);
    return ok();
  } catch (error) {
    return invalid(error instanceof Error ? error.message : "invalid ADVANCE");
  }
}
