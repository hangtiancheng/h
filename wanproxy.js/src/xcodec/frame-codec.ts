import type { ByteQueue } from "./byte-queue.js";
import {
  XCODEC_MAGIC,
  XCODEC_OP_BACKREF,
  XCODEC_OP_ESCAPE,
  XCODEC_OP_EXTRACT,
  XCODEC_OP_REF,
  XCODEC_SEGMENT_LENGTH,
} from "./constants.js";
import { decodeUint64BE, encodeUint64BE } from "./uint64.js";

export type XCodecFrame =
  | { readonly kind: "escape" }
  | { readonly kind: "extract"; readonly segment: Uint8Array }
  | { readonly kind: "ref"; readonly hash: bigint }
  | { readonly kind: "backref"; readonly index: number };

export type FrameReadResult =
  | { readonly status: "frame"; readonly frame: XCodecFrame }
  | { readonly status: "need-more" }
  | { readonly status: "invalid"; readonly reason: string };

export function encodeEscapedBytes(bytes: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (const byte of bytes) {
    output.push(byte);
    if (byte === XCODEC_MAGIC) {
      output.push(XCODEC_OP_ESCAPE);
    }
  }
  return Uint8Array.from(output);
}

export function encodeFrame(frame: XCodecFrame): Uint8Array {
  switch (frame.kind) {
    case "escape":
      return Uint8Array.from([XCODEC_MAGIC, XCODEC_OP_ESCAPE]);
    case "extract": {
      if (frame.segment.length !== XCODEC_SEGMENT_LENGTH) {
        throw new RangeError("extract segment must be exactly 2048 bytes");
      }
      const output = new Uint8Array(2 + XCODEC_SEGMENT_LENGTH);
      output[0] = XCODEC_MAGIC;
      output[1] = XCODEC_OP_EXTRACT;
      output.set(frame.segment, 2);
      return output;
    }
    case "ref": {
      const output = new Uint8Array(10);
      output[0] = XCODEC_MAGIC;
      output[1] = XCODEC_OP_REF;
      output.set(encodeUint64BE(frame.hash), 2);
      return output;
    }
    case "backref":
      if (
        !Number.isInteger(frame.index) ||
        frame.index < 0 ||
        frame.index > 0xff
      ) {
        throw new RangeError("backref index must be in the range 0..255");
      }
      return Uint8Array.from([XCODEC_MAGIC, XCODEC_OP_BACKREF, frame.index]);
  }
}

export function readFrame(queue: ByteQueue): FrameReadResult {
  if (queue.length < 2) {
    return { status: "need-more" };
  }

  const magic = queue.peek(0);
  const opcode = queue.peek(1);
  if (magic !== XCODEC_MAGIC || opcode === undefined) {
    return {
      reason: "frame does not start with XCodec magic",
      status: "invalid",
    };
  }

  switch (opcode) {
    case XCODEC_OP_ESCAPE:
      queue.skip(2);
      return { frame: { kind: "escape" }, status: "frame" };
    case XCODEC_OP_EXTRACT:
      return readExtract(queue);
    case XCODEC_OP_REF:
      return readRef(queue);
    case XCODEC_OP_BACKREF:
      return readBackref(queue);
    default:
      return {
        reason: `unsupported XCodec opcode ${opcode}`,
        status: "invalid",
      };
  }
}

function readExtract(queue: ByteQueue): FrameReadResult {
  if (queue.length < 2 + XCODEC_SEGMENT_LENGTH) {
    return { status: "need-more" };
  }

  queue.skip(2);
  const segment = queue.readExact(XCODEC_SEGMENT_LENGTH);
  if (segment === undefined) {
    return { status: "need-more" };
  }
  return { frame: { kind: "extract", segment }, status: "frame" };
}

function readRef(queue: ByteQueue): FrameReadResult {
  if (queue.length < 10) {
    return { status: "need-more" };
  }

  queue.skip(2);
  const hashBytes = queue.readExact(8);
  if (hashBytes === undefined) {
    return { status: "need-more" };
  }
  return {
    frame: { hash: decodeUint64BE(hashBytes), kind: "ref" },
    status: "frame",
  };
}

function readBackref(queue: ByteQueue): FrameReadResult {
  if (queue.length < 3) {
    return { status: "need-more" };
  }

  queue.skip(2);
  const indexBytes = queue.readExact(1);
  const index = indexBytes?.[0];
  if (index === undefined) {
    return { status: "need-more" };
  }
  return { frame: { index, kind: "backref" }, status: "frame" };
}
