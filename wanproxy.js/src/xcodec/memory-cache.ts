import { XCODEC_SEGMENT_LENGTH } from "./constants.js";
import { formatUint64Hex } from "./uint64.js";

export interface MemoryCacheOptions {
  readonly maxSegments?: number;
}

export class MemoryCache {
  private readonly entries = new Map<string, Uint8Array>();
  private readonly maxSegments: number | undefined;

  public constructor(options: MemoryCacheOptions = {}) {
    const maxSegments = options.maxSegments;
    if (
      maxSegments !== undefined &&
      (!Number.isInteger(maxSegments) || maxSegments < 1)
    ) {
      throw new RangeError("maxSegments must be a positive integer");
    }
    this.maxSegments = maxSegments;
  }

  public get size(): number {
    return this.entries.size;
  }

  public enter(hash: bigint, segment: Uint8Array): void {
    const key = validateEntry(hash, segment);
    if (this.entries.has(key)) {
      throw new Error("cache entry already exists");
    }

    this.evictOldestIfFull();
    this.entries.set(key, segment.slice());
  }

  public has(hash: bigint): boolean {
    return this.entries.has(formatUint64Hex(hash));
  }

  public lookup(hash: bigint): Uint8Array | undefined {
    const key = formatUint64Hex(hash);
    const segment = this.entries.get(key);
    if (segment === undefined) {
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, segment);
    return segment.slice();
  }

  public replace(hash: bigint, segment: Uint8Array): void {
    const key = validateEntry(hash, segment);
    if (!this.entries.has(key)) {
      throw new Error("cache entry does not exist");
    }

    this.entries.delete(key);
    this.entries.set(key, segment.slice());
  }

  private evictOldestIfFull(): void {
    if (
      this.maxSegments === undefined ||
      this.entries.size < this.maxSegments
    ) {
      return;
    }

    const oldestKey = this.entries.keys().next().value;
    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }
}

function validateEntry(hash: bigint, segment: Uint8Array): string {
  if (segment.length !== XCODEC_SEGMENT_LENGTH) {
    throw new RangeError("cache segment must be exactly 2048 bytes");
  }
  return formatUint64Hex(hash);
}
