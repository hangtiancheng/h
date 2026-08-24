import { describe, expect, it } from "vitest";

import {
  ByteQueue,
  encodeEscapedBytes,
  encodeFrame,
  readFrame,
  XCODEC_MAGIC,
  XCODEC_OP_ESCAPE,
  XCODEC_SEGMENT_LENGTH,
  type XCodecFrame,
} from "@/xcodec/index.js";

function queueFrom(bytes: Uint8Array): ByteQueue {
  const queue = new ByteQueue();
  queue.append(bytes);
  return queue;
}

class BrokenReadQueue extends ByteQueue {
  public override readExact(_length: number): Uint8Array | undefined {
    return undefined;
  }
}

describe("frame codec", () => {
  it("escapes literal magic bytes", () => {
    expect(encodeEscapedBytes(Uint8Array.from([1, XCODEC_MAGIC, 2]))).toEqual(
      Uint8Array.from([1, XCODEC_MAGIC, XCODEC_OP_ESCAPE, 2]),
    );
  });

  it("round-trips all frame kinds", () => {
    const segment = new Uint8Array(XCODEC_SEGMENT_LENGTH).fill(0xab);
    const frames: XCodecFrame[] = [
      { kind: "escape" },
      { kind: "extract", segment },
      { hash: 0x0123_4567_89ab_cdefn, kind: "ref" },
      { index: 7, kind: "backref" },
    ];

    for (const frame of frames) {
      const result = readFrame(queueFrom(encodeFrame(frame)));
      expect(result).toEqual({ frame, status: "frame" });
    }
  });

  it("reports incomplete and invalid frames", () => {
    expect(readFrame(queueFrom(Uint8Array.from([XCODEC_MAGIC])))).toEqual({
      status: "need-more",
    });
    expect(
      readFrame(queueFrom(Uint8Array.from([0, XCODEC_OP_ESCAPE]))),
    ).toEqual({
      reason: "frame does not start with XCodec magic",
      status: "invalid",
    });
    expect(readFrame(queueFrom(Uint8Array.from([XCODEC_MAGIC, 0xff])))).toEqual(
      {
        reason: "unsupported XCodec opcode 255",
        status: "invalid",
      },
    );
    expect(readFrame(queueFrom(Uint8Array.from([XCODEC_MAGIC, 1, 0])))).toEqual(
      {
        status: "need-more",
      },
    );
    expect(readFrame(queueFrom(Uint8Array.from([XCODEC_MAGIC, 2, 0])))).toEqual(
      {
        status: "need-more",
      },
    );
    expect(readFrame(queueFrom(Uint8Array.from([XCODEC_MAGIC, 3])))).toEqual({
      status: "need-more",
    });
  });

  it("rejects invalid frame payloads", () => {
    expect(() =>
      encodeFrame({ kind: "extract", segment: new Uint8Array(1) }),
    ).toThrow(RangeError);
    expect(() => encodeFrame({ index: 256, kind: "backref" })).toThrow(
      RangeError,
    );
  });

  it("handles inconsistent queue reads defensively", () => {
    for (const bytes of [
      encodeFrame({
        kind: "extract",
        segment: new Uint8Array(XCODEC_SEGMENT_LENGTH),
      }),
      encodeFrame({ hash: 1n, kind: "ref" }),
      encodeFrame({ index: 1, kind: "backref" }),
    ]) {
      const queue = new BrokenReadQueue();
      queue.append(bytes);
      expect(readFrame(queue)).toEqual({ status: "need-more" });
    }
  });
});
