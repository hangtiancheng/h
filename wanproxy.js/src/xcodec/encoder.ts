import { BackrefWindow } from "./backref-window.js";
import { byteArraysEqual, concatByteArrays } from "./byte-array.js";
import type { XCodecCache } from "./cache-interface.js";
import { XCODEC_SEGMENT_LENGTH } from "./constants.js";
import { encodeEscapedBytes, encodeFrame } from "./frame-codec.js";
import { XCodecHash } from "./hash.js";
import { MemoryCache } from "./memory-cache.js";

export interface EncoderOptions {
  readonly cache?: XCodecCache;
  readonly enableBackrefs?: boolean;
}

export interface EncodeResult {
  readonly encoded: Uint8Array;
  readonly references: ReadonlyMap<bigint, Uint8Array>;
}

interface Candidate {
  readonly offset: number;
  readonly hash: bigint;
}

export class XCodecEncoder {
  private readonly cache: XCodecCache;
  private readonly enableBackrefs: boolean;
  private readonly window = new BackrefWindow();

  public constructor(options: EncoderOptions = {}) {
    this.cache = options.cache ?? new MemoryCache();
    this.enableBackrefs = options.enableBackrefs ?? false;
  }

  public encode(input: Uint8Array): Uint8Array {
    return this.encodeWithReferences(input).encoded;
  }

  public encodeWithReferences(input: Uint8Array): EncodeResult {
    const output: Uint8Array[] = [];
    const references = new Map<bigint, Uint8Array>();

    if (input.length === 0) {
      return { encoded: new Uint8Array(), references };
    }

    if (input.length < XCODEC_SEGMENT_LENGTH) {
      output.push(encodeEscapedBytes(input));
      return { encoded: concatByteArrays(output), references };
    }

    const xhash = new XCodecHash();
    let consumed = 0;
    let candidate: Candidate | undefined;
    let fed = 0;

    for (let pos = 0; pos < input.length; pos++) {
      if (fed + (input.length - pos) < XCODEC_SEGMENT_LENGTH) {
        break;
      }

      if (fed < XCODEC_SEGMENT_LENGTH) {
        xhash.add(input[pos]);
        fed++;
        if (fed < XCODEC_SEGMENT_LENGTH) continue;
      } else {
        xhash.roll(input[pos]);
        fed++;
      }

      const start = pos + 1 - XCODEC_SEGMENT_LENGTH;
      const hash = xhash.mix();

      if (
        candidate !== undefined &&
        candidate.offset + XCODEC_SEGMENT_LENGTH <= start
      ) {
        this.emitDeclaration(output, input, consumed, candidate);
        consumed = candidate.offset + XCODEC_SEGMENT_LENGTH;
        candidate = undefined;
      }

      const segment = input.subarray(start, start + XCODEC_SEGMENT_LENGTH);
      const cached = this.cache.lookup(hash);

      if (cached !== undefined) {
        if (byteArraysEqual(cached, segment)) {
          if (start > consumed) {
            output.push(encodeEscapedBytes(input.subarray(consumed, start)));
          }
          output.push(this.encodeReference(hash, cached));
          references.set(hash, cached.slice());
          consumed = start + XCODEC_SEGMENT_LENGTH;
          xhash.reset();
          fed = 0;
          pos = consumed - 1;
          candidate = undefined;
          continue;
        }
        continue;
      }

      if (candidate === undefined) {
        candidate = { hash, offset: start };
      }
    }

    if (candidate !== undefined) {
      this.emitDeclaration(output, input, consumed, candidate);
      consumed = candidate.offset + XCODEC_SEGMENT_LENGTH;
    }

    if (consumed < input.length) {
      output.push(encodeEscapedBytes(input.subarray(consumed)));
    }

    return { encoded: concatByteArrays(output), references };
  }

  private emitDeclaration(
    output: Uint8Array[],
    input: Uint8Array,
    consumed: number,
    candidate: Candidate,
  ): void {
    if (candidate.offset > consumed) {
      output.push(
        encodeEscapedBytes(input.subarray(consumed, candidate.offset)),
      );
    }
    const seg = input.subarray(
      candidate.offset,
      candidate.offset + XCODEC_SEGMENT_LENGTH,
    );
    this.cache.enter(candidate.hash, seg);
    this.window.declare(candidate.hash, seg);
    output.push(encodeFrame({ kind: "extract", segment: seg }));
  }

  private encodeReference(hash: bigint, segment: Uint8Array): Uint8Array {
    if (this.enableBackrefs) {
      const index = this.window.find(hash, segment);
      if (index !== undefined) {
        return encodeFrame({ index, kind: "backref" });
      }
    }

    this.window.declare(hash, segment);
    return encodeFrame({ hash, kind: "ref" });
  }
}

export function encodeXCodec(
  input: Uint8Array,
  options: EncoderOptions = {},
): Uint8Array {
  return new XCodecEncoder(options).encode(input);
}
