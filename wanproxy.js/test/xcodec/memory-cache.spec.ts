import { describe, expect, it } from "vitest";

import { MemoryCache, XCODEC_SEGMENT_LENGTH } from "@/xcodec/index.js";

function segment(byte: number): Uint8Array {
  return new Uint8Array(XCODEC_SEGMENT_LENGTH).fill(byte);
}

describe("MemoryCache", () => {
  it("enters, looks up, replaces, and isolates stored data", () => {
    const cache = new MemoryCache();
    const original = segment(1);
    cache.enter(1n, original);
    original[0] = 9;

    const firstLookup = cache.lookup(1n);
    expect(firstLookup).toEqual(segment(1));
    if (firstLookup !== undefined) {
      firstLookup[0] = 8;
    }
    expect(cache.lookup(1n)).toEqual(segment(1));

    const replacement = segment(2);
    cache.replace(1n, replacement);
    replacement[0] = 7;
    expect(cache.lookup(1n)).toEqual(segment(2));
    expect(cache.size).toBe(1);
  });

  it("enforces segment length and cache entry invariants", () => {
    const cache = new MemoryCache();
    expect(() => new MemoryCache({ maxSegments: 0 })).toThrow(RangeError);
    expect(() => new MemoryCache({ maxSegments: 1.5 })).toThrow(RangeError);
    expect(() => cache.enter(1n, new Uint8Array(1))).toThrow(RangeError);
    expect(() => cache.enter(-1n, segment(1))).toThrow(RangeError);
    expect(() => cache.replace(1n, segment(1))).toThrow(Error);

    cache.enter(1n, segment(1));
    expect(() => cache.enter(1n, segment(1))).toThrow(Error);
  });

  it("evicts the least recently used entry when limited", () => {
    const cache = new MemoryCache({ maxSegments: 2 });
    cache.enter(1n, segment(1));
    cache.enter(2n, segment(2));

    expect(cache.lookup(1n)).toEqual(segment(1));
    cache.enter(3n, segment(3));

    expect(cache.has(1n)).toBe(true);
    expect(cache.has(2n)).toBe(false);
    expect(cache.has(3n)).toBe(true);
    expect(cache.lookup(2n)).toBeUndefined();
    expect(cache.size).toBe(2);
  });

  it("refreshes replaced entries for LRU ordering", () => {
    const cache = new MemoryCache({ maxSegments: 2 });
    cache.enter(1n, segment(1));
    cache.enter(2n, segment(2));
    cache.replace(1n, segment(9));
    cache.enter(3n, segment(3));

    expect(cache.has(1n)).toBe(true);
    expect(cache.has(2n)).toBe(false);
    expect(cache.lookup(1n)).toEqual(segment(9));
  });
});
