import { describe, expect, it } from "vitest";

import {
  decodeUint64BE,
  encodeUint64BE,
  formatUint64Hex,
} from "../../src/xcodec/index.js";

describe("uint64 helpers", () => {
  it("encodes and decodes big-endian values", () => {
    const value = 0x0123_4567_89ab_cdefn;
    const encoded = encodeUint64BE(value);

    expect(Array.from(encoded)).toEqual([1, 35, 69, 103, 137, 171, 205, 239]);
    expect(decodeUint64BE(encoded)).toBe(value);
    expect(formatUint64Hex(value)).toBe("0123456789abcdef");
  });

  it("rejects out-of-range inputs", () => {
    expect(() => encodeUint64BE(-1n)).toThrow(RangeError);
    expect(() => encodeUint64BE(0x1_0000_0000_0000_0000n)).toThrow(RangeError);
    expect(() => decodeUint64BE(new Uint8Array(7))).toThrow(RangeError);
    expect(() => formatUint64Hex(0x1_0000_0000_0000_0000n)).toThrow(RangeError);
  });
});
