import { describe, expect, it } from "vitest";

import {
  decodeXCodec,
  encodeFrame,
  encodeXCodec,
  MemoryCache,
  XCODEC_MAGIC,
  XCODEC_SEGMENT_LENGTH,
  XCodecDecoder,
  XCodecEncoder,
  XCodecHash,
} from "@/xcodec/index.js";

function repeatedSegment(byte: number, count: number): Uint8Array {
  return new Uint8Array(XCODEC_SEGMENT_LENGTH * count).fill(byte);
}

function deterministicBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 31 + 17) & 0xff);
}

function expectDecodeOk(encoded: Uint8Array): Uint8Array {
  const decoded = decodeXCodec(encoded);
  expect(decoded.status).toBe("ok");
  return decoded.output;
}

describe("pure XCodec encoder and decoder", () => {
  it("round-trips empty and short inputs with escaped magic bytes", () => {
    expect(encodeXCodec(new Uint8Array())).toEqual(new Uint8Array());
    expect(expectDecodeOk(new Uint8Array())).toEqual(new Uint8Array());

    const input = Uint8Array.from([1, XCODEC_MAGIC, 2, XCODEC_MAGIC]);
    const encoded = encodeXCodec(input);
    expect(encoded).toEqual(
      Uint8Array.from([1, XCODEC_MAGIC, 0, 2, XCODEC_MAGIC, 0]),
    );
    expect(expectDecodeOk(encoded)).toEqual(input);
  });

  it("ports the C++ repeated-byte encode/decode behavior", () => {
    for (const byte of [0, 1, 127, 128, 240, 241, 255]) {
      const input = repeatedSegment(byte, 32);
      const encoded = encodeXCodec(input);

      expect(encoded.length).toBeLessThan(input.length);
      expect(expectDecodeOk(encoded)).toEqual(input);
    }
  });

  it("round-trips deterministic payloads up to 64 KiB", () => {
    for (const length of [1, 127, 2047, 2048, 2049, 4096, 65536]) {
      const input = deterministicBytes(length);
      expect(expectDecodeOk(encodeXCodec(input))).toEqual(input);
    }
  });

  it("can reuse encoder cache across calls", () => {
    const cache = new MemoryCache();
    const encoder = new XCodecEncoder({ cache });
    const decoder = new XCodecDecoder({ cache });
    const first = repeatedSegment(7, 1);
    const second = repeatedSegment(7, 1);

    const decodedFirst = decoder.decode(encoder.encode(first));
    expect(decodedFirst.status).toBe("ok");
    expect(decodedFirst.output).toEqual(first);
    const encodedSecond = encoder.encode(second);
    expect(encodedSecond.length).toBe(10);
    const decodedSecond = decoder.decode(encodedSecond);
    expect(decodedSecond.status).toBe("ok");
    expect(decodedSecond.output).toEqual(second);
  });

  it("emits and decodes backrefs only when enabled", () => {
    const input = repeatedSegment(9, 2);
    const encoded = encodeXCodec(input, { enableBackrefs: true });

    expect(encoded.length).toBe(2 + XCODEC_SEGMENT_LENGTH + 3);
    expect(expectDecodeOk(encoded)).toEqual(input);
  });

  it("falls back to escaped bytes on cache hash collisions", () => {
    const input = repeatedSegment(3, 1);
    const hash = XCodecHash.hashSegment(input);
    const cache = new MemoryCache();
    cache.enter(hash, repeatedSegment(4, 1));

    const encoded = encodeXCodec(input, { cache });
    expect(encoded.length).toBeGreaterThanOrEqual(input.length);
    expect(expectDecodeOk(encoded)).toEqual(input);
  });

  it("returns typed unknown-hash and invalid outcomes", () => {
    const unknown = decodeXCodec(encodeFrame({ hash: 1n, kind: "ref" }));
    expect(unknown).toEqual({
      hashes: [1n],
      output: new Uint8Array(),
      status: "unknown-hash",
    });

    const invalidOpcode = decodeXCodec(Uint8Array.from([XCODEC_MAGIC, 0xff]));
    expect(invalidOpcode).toEqual({
      output: new Uint8Array(),
      reason: "unsupported XCodec opcode 255",
      status: "invalid",
    });

    const invalidBackref = decodeXCodec(
      encodeFrame({ index: 7, kind: "backref" }),
    );
    expect(invalidBackref).toEqual({
      output: new Uint8Array(),
      reason: "backref index is not present",
      status: "invalid",
    });
  });

  it("preserves partial trailing magic across decoder calls", () => {
    const decoder = new XCodecDecoder();
    const first = decoder.decode(Uint8Array.from([1, XCODEC_MAGIC]));
    expect(first).toEqual({
      output: Uint8Array.from([1]),
      status: "need-more",
    });

    const second = decoder.decode(Uint8Array.from([0, 2]));
    expect(second).toEqual({
      output: Uint8Array.from([XCODEC_MAGIC, 2]),
      status: "ok",
    });
  });

  it("finds cached segments at non-aligned offsets via rolling hash", () => {
    const seg = deterministicBytes(XCODEC_SEGMENT_LENGTH);
    const cache = new MemoryCache();
    const encoder = new XCodecEncoder({ cache });
    const decoder = new XCodecDecoder({ cache });

    encoder.encode(seg);

    const prefix = Uint8Array.from([0x42]);
    const shifted = new Uint8Array(prefix.length + seg.length);
    shifted.set(prefix, 0);
    shifted.set(seg, prefix.length);

    const encoded = encoder.encode(shifted);
    expect(encoded.length).toBeLessThan(shifted.length);

    const decoded = decoder.decode(encoded);
    expect(decoded.status).toBe("ok");
    expect(decoded.output).toEqual(shifted);
  });

  it("uses the candidate system to declare and then reference", () => {
    const cache = new MemoryCache();
    const encoder = new XCodecEncoder({ cache });
    const decoder = new XCodecDecoder({ cache });

    const seg = deterministicBytes(XCODEC_SEGMENT_LENGTH);
    const padding = new Uint8Array(XCODEC_SEGMENT_LENGTH).fill(0xaa);
    const input = new Uint8Array(padding.length + seg.length);
    input.set(padding, 0);
    input.set(seg, padding.length);

    encoder.encode(input);

    const second = new Uint8Array(padding.length + seg.length);
    second.set(padding, 0);
    second.set(seg, padding.length);
    const encoded = encoder.encode(second);

    const decoded = decoder.decode(encoded);
    expect(decoded.status).toBe("ok");
    expect(decoded.output).toEqual(second);
  });

  it("handles single-byte offset shift with rolling hash", () => {
    const cache = new MemoryCache();
    const encoder = new XCodecEncoder({ cache });
    const decoder = new XCodecDecoder({ cache });

    const original = deterministicBytes(XCODEC_SEGMENT_LENGTH * 4);
    encoder.encode(original);

    const shifted = new Uint8Array(1 + original.length);
    shifted[0] = 0x42;
    shifted.set(original, 1);

    const encoded = encoder.encode(shifted);
    expect(encoded.length).toBeLessThan(shifted.length);

    const decoded = decoder.decode(encoded);
    expect(decoded.status).toBe("ok");
    expect(decoded.output).toEqual(shifted);
  });
});
