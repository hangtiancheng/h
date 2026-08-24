import type { ByteQueue } from "../xcodec/byte-queue.js";
import { XCODEC_SEGMENT_LENGTH } from "../xcodec/constants.js";
import { decodeUint64BE } from "../xcodec/uint64.js";
import { decodeUint16BE, decodeUint32BE } from "./binary.js";
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
import type { PipeFrameReadResult } from "./control-frame.js";

export function readPipeFrame(queue: ByteQueue): PipeFrameReadResult {
  const opcode = queue.peek(0);
  if (opcode === undefined) {
    return { status: "need-more" };
  }
  switch (opcode) {
    case PIPE_OP_HELLO:
      return readHello(queue);
    case PIPE_OP_FRAME:
      return readPayloadFrame(queue);
    case PIPE_OP_ASK:
      return readAsk(queue);
    case PIPE_OP_LEARN:
      return readLearn(queue);
    case PIPE_OP_ADVANCE:
      return readAdvance(queue);
    case PIPE_OP_EOS:
      queue.skip(1);
      return { frame: { kind: "eos" }, status: "frame" };
    case PIPE_OP_EOS_ACK:
      queue.skip(1);
      return { frame: { kind: "eos-ack" }, status: "frame" };
    default:
      return { reason: "unsupported pipe protocol opcode", status: "invalid" };
  }
}

function readHello(queue: ByteQueue): PipeFrameReadResult {
  if (queue.length < 2) {
    return { status: "need-more" };
  }
  const length = queue.peek(1);
  if (length !== PIPE_HELLO_ID_LENGTH) {
    return { reason: "unsupported hello id length", status: "invalid" };
  }
  if (queue.length < 2 + length) {
    return { status: "need-more" };
  }
  queue.skip(2);
  const id = queue.readExact(length);
  return id === undefined
    ? { status: "need-more" }
    : { frame: { id, kind: "hello" }, status: "frame" };
}

function readPayloadFrame(queue: ByteQueue): PipeFrameReadResult {
  if (queue.length < 5) {
    return { status: "need-more" };
  }
  const length = decodeUint32BE(queue.toUint8Array().subarray(1, 5));
  if (length === 0 || length > PIPE_MAX_FRAME) {
    return { reason: "invalid framed data length", status: "invalid" };
  }
  if (queue.length < 5 + length) {
    return { status: "need-more" };
  }
  queue.skip(5);
  const payload = queue.readExact(length);
  return payload === undefined
    ? { status: "need-more" }
    : { frame: { kind: "frame", payload }, status: "frame" };
}

function readAsk(queue: ByteQueue): PipeFrameReadResult {
  const count = readCount(queue, "ask");
  if (typeof count !== "number") {
    return count;
  }
  if (queue.length < 3 + count * 8) {
    return { status: "need-more" };
  }
  queue.skip(3);
  const hashes: bigint[] = [];
  for (let index = 0; index < count; index += 1) {
    const hashBytes = queue.readExact(8);
    if (hashBytes === undefined) {
      return { status: "need-more" };
    }
    hashes.push(decodeUint64BE(hashBytes));
  }
  return { frame: { hashes, kind: "ask" }, status: "frame" };
}

function readLearn(queue: ByteQueue): PipeFrameReadResult {
  const count = readCount(queue, "learn");
  if (typeof count !== "number") {
    return count;
  }
  if (queue.length < 3 + count * XCODEC_SEGMENT_LENGTH) {
    return { status: "need-more" };
  }
  queue.skip(3);
  const segments: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) {
    const segment = queue.readExact(XCODEC_SEGMENT_LENGTH);
    if (segment === undefined) {
      return { status: "need-more" };
    }
    segments.push(segment);
  }
  return { frame: { kind: "learn", segments }, status: "frame" };
}

function readAdvance(queue: ByteQueue): PipeFrameReadResult {
  if (queue.length < 5) {
    return { status: "need-more" };
  }
  const count = decodeUint32BE(queue.toUint8Array().subarray(1, 5));
  if (count === 0) {
    return { reason: "invalid advance count", status: "invalid" };
  }
  queue.skip(5);
  return { frame: { count, kind: "advance" }, status: "frame" };
}

function readCount(
  queue: ByteQueue,
  name: string,
): number | PipeFrameReadResult {
  if (queue.length < 3) {
    return { status: "need-more" };
  }
  const count = decodeUint16BE(queue.toUint8Array().subarray(1, 3));
  if (count === 0 || count > PIPE_ASK_MAX) {
    return { reason: `invalid ${name} count`, status: "invalid" };
  }
  return count;
}
