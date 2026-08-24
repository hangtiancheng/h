import { describe, expect, it } from "vitest";

import {
  dumpXCodecFrames,
  encodeFrame,
  XCODEC_MAGIC,
  XCODEC_SEGMENT_LENGTH,
} from "@/xcodec/index.js";

describe("dumpXCodecFrames", () => {
  it("formats known frames", () => {
    const segment = new Uint8Array(XCODEC_SEGMENT_LENGTH).fill(1);
    const input = new Uint8Array([
      ...encodeFrame({ kind: "escape" }),
      ...encodeFrame({ kind: "extract", segment }),
      ...encodeFrame({ hash: 0x1234n, kind: "ref" }),
      ...encodeFrame({ index: 3, kind: "backref" }),
    ]);

    expect(dumpXCodecFrames(input)).toEqual([
      "ESCAPE",
      "EXTRACT 2048",
      "REF 0000000000001234",
      "BACKREF 3",
    ]);
  });

  it("reports incomplete and invalid frames", () => {
    expect(dumpXCodecFrames(Uint8Array.from([XCODEC_MAGIC]))).toEqual([
      "need-more",
    ]);
    expect(dumpXCodecFrames(Uint8Array.from([XCODEC_MAGIC, 0xff]))).toEqual([
      "invalid unsupported XCodec opcode 255",
    ]);
  });
});
