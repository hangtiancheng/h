import { describe, expect, it } from "vitest";
import {
  encodePipeFrame,
  PIPE_OP_ASK,
  PIPE_OP_FRAME,
  PIPE_OP_HELLO,
  readPipeFrame,
} from "@/pipe-protocol/index.js";
import { ByteQueue, XCODEC_SEGMENT_LENGTH } from "@/xcodec/index.js";

function queueFrom(bytes: Uint8Array): ByteQueue {
  const queue = new ByteQueue();
  queue.append(bytes);
  return queue;
}

describe("pipe control frames", () => {
  it("round-trips every frame kind", () => {
    const id = new Uint8Array(16).fill(1);
    const segment = new Uint8Array(XCODEC_SEGMENT_LENGTH).fill(2);
    const frames = [
      { id, kind: "hello" },
      { kind: "frame", payload: Uint8Array.from([1, 2, 3]) },
      { hashes: [1n, 2n], kind: "ask" },
      { kind: "learn", segments: [segment] },
      { count: 3, kind: "advance" },
      { kind: "eos" },
      { kind: "eos-ack" },
    ] as const;

    for (const frame of frames) {
      expect(readPipeFrame(queueFrom(encodePipeFrame(frame)))).toEqual({
        frame,
        status: "frame",
      });
    }
  });

  it("reports partial and invalid frames", () => {
    expect(readPipeFrame(queueFrom(new Uint8Array()))).toEqual({
      status: "need-more",
    });
    expect(readPipeFrame(queueFrom(Uint8Array.from([PIPE_OP_HELLO])))).toEqual({
      status: "need-more",
    });
    expect(
      readPipeFrame(queueFrom(Uint8Array.from([PIPE_OP_HELLO, 1]))),
    ).toEqual({
      reason: "unsupported hello id length",
      status: "invalid",
    });
    expect(
      readPipeFrame(queueFrom(Uint8Array.from([PIPE_OP_FRAME, 0, 0, 0, 0]))),
    ).toEqual({
      reason: "invalid framed data length",
      status: "invalid",
    });
    expect(
      readPipeFrame(queueFrom(Uint8Array.from([PIPE_OP_ASK, 0, 0]))),
    ).toEqual({
      reason: "invalid ask count",
      status: "invalid",
    });
    expect(readPipeFrame(queueFrom(Uint8Array.from([0])))).toEqual({
      reason: "unsupported pipe protocol opcode",
      status: "invalid",
    });
  });

  it("rejects invalid encodable frames", () => {
    expect(() =>
      encodePipeFrame({ id: new Uint8Array(1), kind: "hello" }),
    ).toThrow(RangeError);
    expect(() =>
      encodePipeFrame({ kind: "frame", payload: new Uint8Array() }),
    ).toThrow(RangeError);
    expect(() => encodePipeFrame({ hashes: [], kind: "ask" })).toThrow(
      RangeError,
    );
    expect(() =>
      encodePipeFrame({ kind: "learn", segments: [new Uint8Array(1)] }),
    ).toThrow(RangeError);
    expect(() => encodePipeFrame({ count: 0, kind: "advance" })).toThrow(
      RangeError,
    );
  });
});
