import { concatByteArrays } from "../xcodec/byte-array.js";
import { XCODEC_SEGMENT_LENGTH } from "../xcodec/constants.js";
import { encodeUint64BE } from "../xcodec/uint64.js";
import { encodeUint16BE, encodeUint32BE } from "./binary.js";
import {
  PIPE_ASK_MAX,
  PIPE_HELLO_ID_LENGTH,
  PIPE_MAX_FRAME,
  PIPE_OP_ADVANCE,
  PIPE_OP_ASK,
  PIPE_OP_EOS,
  PIPE_OP_EOS_ACK,
  PIPE_OP_FRAME,
  PIPE_OP_HELLO,
  PIPE_OP_LEARN,
} from "./constants.js";

export type PipeControlFrame =
  | { readonly kind: "hello"; readonly id: Uint8Array }
  | { readonly kind: "frame"; readonly payload: Uint8Array }
  | { readonly kind: "ask"; readonly hashes: readonly bigint[] }
  | { readonly kind: "learn"; readonly segments: readonly Uint8Array[] }
  | { readonly kind: "advance"; readonly count: number }
  | { readonly kind: "eos" }
  | { readonly kind: "eos-ack" };

export type PipeFrameReadResult =
  | { readonly status: "frame"; readonly frame: PipeControlFrame }
  | { readonly status: "need-more" }
  | { readonly status: "invalid"; readonly reason: string };

export function encodePipeFrame(frame: PipeControlFrame): Uint8Array {
  switch (frame.kind) {
    case "hello":
      if (frame.id.length !== PIPE_HELLO_ID_LENGTH) {
        throw new RangeError("hello id must be exactly 16 bytes");
      }
      return concatByteArrays([
        Uint8Array.from([PIPE_OP_HELLO, frame.id.length]),
        frame.id,
      ]);
    case "frame":
      if (frame.payload.length === 0 || frame.payload.length > PIPE_MAX_FRAME) {
        throw new RangeError("frame payload length is invalid");
      }
      return concatByteArrays([
        Uint8Array.from([PIPE_OP_FRAME]),
        encodeUint32BE(frame.payload.length),
        frame.payload,
      ]);
    case "ask":
      validateCount(frame.hashes.length, "ask");
      return concatByteArrays([
        Uint8Array.from([PIPE_OP_ASK]),
        encodeUint16BE(frame.hashes.length),
        ...frame.hashes.map((hash) => encodeUint64BE(hash)),
      ]);
    case "learn":
      validateCount(frame.segments.length, "learn");
      for (const segment of frame.segments) {
        if (segment.length !== XCODEC_SEGMENT_LENGTH) {
          throw new RangeError("learn segment must be exactly 2048 bytes");
        }
      }
      return concatByteArrays([
        Uint8Array.from([PIPE_OP_LEARN]),
        encodeUint16BE(frame.segments.length),
        ...frame.segments,
      ]);
    case "advance":
      if (!Number.isInteger(frame.count) || frame.count < 1) {
        throw new RangeError("advance count must be positive");
      }
      return concatByteArrays([
        Uint8Array.from([PIPE_OP_ADVANCE]),
        encodeUint32BE(frame.count),
      ]);
    case "eos":
      return Uint8Array.from([PIPE_OP_EOS]);
    case "eos-ack":
      return Uint8Array.from([PIPE_OP_EOS_ACK]);
  }
}

function validateCount(count: number, name: string): void {
  if (!Number.isInteger(count) || count < 1 || count > PIPE_ASK_MAX) {
    throw new RangeError(`${name} count is invalid`);
  }
}
