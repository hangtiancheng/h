import { describe, expect, it } from "vitest";

import {
  BackrefWindow,
  XCODEC_SEGMENT_LENGTH,
  XCODEC_WINDOW_COUNT,
} from "../../src/xcodec/index.js";

function segment(byte: number): Uint8Array {
  return new Uint8Array(XCODEC_SEGMENT_LENGTH).fill(byte);
}

describe("BackrefWindow", () => {
  it("declares, dereferences, finds, and isolates stored data", () => {
    const window = new BackrefWindow();
    const original = segment(1);

    expect(window.declare(1n, original)).toBe(false);
    original[0] = 9;
    expect(window.find(1n)).toBe(0);
    expect(window.find(1n, segment(1))).toBe(0);
    expect(window.find(1n, segment(9))).toBeUndefined();
    expect(window.find(1n, new Uint8Array(1))).toBeUndefined();

    const dereferenced = window.dereference(0);
    expect(dereferenced).toEqual(segment(1));
    if (dereferenced !== undefined) {
      dereferenced[0] = 8;
    }
    expect(window.dereference(0)).toEqual(segment(1));
  });

  it("moves duplicate hashes to the current cursor and clears the old slot", () => {
    const window = new BackrefWindow();
    window.declare(1n, segment(1));
    window.declare(2n, segment(2));

    expect(window.declare(1n, segment(3))).toBe(true);
    expect(window.dereference(0)).toBeUndefined();
    expect(window.find(1n)).toBe(2);
    expect(window.dereference(2)).toEqual(segment(3));
  });

  it("evicts overwritten slots in ring order", () => {
    const window = new BackrefWindow();
    for (let index = 0; index < XCODEC_WINDOW_COUNT; index += 1) {
      window.declare(BigInt(index + 1), segment(index & 0xff));
    }

    expect(window.find(1n)).toBe(0);
    expect(window.declare(BigInt(XCODEC_WINDOW_COUNT + 1), segment(7))).toBe(
      false,
    );
    expect(window.find(1n)).toBeUndefined();
    expect(window.dereference(0)).toEqual(segment(7));
    expect(window.find(BigInt(XCODEC_WINDOW_COUNT + 1))).toBe(0);
  });

  it("returns undefined for absent hashes and empty slots", () => {
    const window = new BackrefWindow();
    expect(window.find(1n)).toBeUndefined();
    expect(window.dereference(0)).toBeUndefined();
  });

  it("rejects invalid hashes, segments, and indexes", () => {
    const window = new BackrefWindow();
    expect(() => window.declare(0n, segment(1))).toThrow(RangeError);
    expect(() => window.declare(-1n, segment(1))).toThrow(RangeError);
    expect(() => window.declare(1n, new Uint8Array(1))).toThrow(RangeError);
    expect(() => window.dereference(-1)).toThrow(RangeError);
    expect(() => window.dereference(256)).toThrow(RangeError);
    expect(() => window.dereference(1.5)).toThrow(RangeError);
  });
});
