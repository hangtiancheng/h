import { XCODEC_SEGMENT_LENGTH } from "./constants.js";

const UINT64_MASK = 0xffff_ffff_ffff_ffffn;

function validateByte(byte: number): void {
  if (!Number.isInteger(byte) || byte < 0 || byte > 0xff) {
    throw new RangeError("byte must be an integer in the range 0..255");
  }
}

function findFirstSetBit(byte: number): number {
  if (byte === 0) {
    return 0;
  }

  let bit = 1;
  let shifted = byte;
  while ((shifted & 1) === 0) {
    shifted >>>= 1;
    bit += 1;
  }
  return bit;
}

class RollingHash {
  private readonly words = new Uint32Array(XCODEC_SEGMENT_LENGTH);
  private sum1 = 0;
  private sum2 = 0;

  public add(word: number, start: number): void {
    this.words[start] = word;
    this.sum1 = (this.sum1 + word) >>> 0;
    this.sum2 = (this.sum2 + this.sum1) >>> 0;
  }

  public reset(): void {
    this.sum1 = 0;
    this.sum2 = 0;
  }

  public roll(word: number, start: number): void {
    const dead = this.words[start] ?? 0;
    this.sum1 = (this.sum1 - dead) >>> 0;
    this.sum2 = (this.sum2 - dead * XCODEC_SEGMENT_LENGTH) >>> 0;
    this.words[start] = word;
    this.sum1 = (this.sum1 + word) >>> 0;
    this.sum2 = (this.sum2 + this.sum1) >>> 0;
  }

  public mix(leftShift: number): bigint {
    const shiftedSum1 = (this.sum1 << leftShift) >>> 0;
    return BigInt((shiftedSum1 + this.sum2) >>> 0);
  }
}

export class XCodecHash {
  private readonly bytes = new RollingHash();
  private readonly bits = new RollingHash();
  private length = 0;
  private start = 0;

  public add(byte: number): void {
    validateByte(byte);
    if (this.length >= XCODEC_SEGMENT_LENGTH) {
      throw new RangeError("hash window is already full");
    }

    this.bytes.add(byte + 1, this.start);
    this.bits.add(findFirstSetBit(byte), this.start);
    this.length += 1;
    this.start = (this.start + 1) % XCODEC_SEGMENT_LENGTH;
  }

  public reset(): void {
    this.bytes.reset();
    this.bits.reset();
    this.length = 0;
    this.start = 0;
  }

  public roll(byte: number): void {
    validateByte(byte);
    if (this.length !== XCODEC_SEGMENT_LENGTH) {
      throw new RangeError("hash window must be full before rolling");
    }

    this.bytes.roll(byte + 1, this.start);
    this.bits.roll(findFirstSetBit(byte), this.start);
    this.start = (this.start + 1) % XCODEC_SEGMENT_LENGTH;
  }

  public mix(): bigint {
    if (this.length !== XCODEC_SEGMENT_LENGTH) {
      throw new RangeError("hash window must be full before mixing");
    }

    const bitsHash = this.bits.mix(16);
    const bytesHash = this.bytes.mix(20);
    return ((bitsHash << 36n) + bytesHash) & UINT64_MASK;
  }

  public static hashSegment(segment: Uint8Array): bigint {
    if (segment.length !== XCODEC_SEGMENT_LENGTH) {
      throw new RangeError("segment must be exactly 2048 bytes");
    }

    const hash = new XCodecHash();
    for (const byte of segment) {
      hash.add(byte);
    }
    return hash.mix();
  }
}
