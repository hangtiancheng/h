import { XCODEC_SEGMENT_LENGTH, XCODEC_WINDOW_COUNT } from "./constants.js";
import { formatUint64Hex } from "./uint64.js";

interface WindowEntry {
  readonly index: number;
  readonly segment: Uint8Array;
}

export class BackrefWindow {
  private readonly slots: (bigint | undefined)[] = Array.from({
    length: XCODEC_WINDOW_COUNT,
  });
  private readonly present = new Map<string, WindowEntry>();
  private cursor = 0;

  public declare(hash: bigint, segment: Uint8Array): boolean {
    const key = validateEntry(hash, segment);
    const collision = this.present.get(key);
    if (collision !== undefined) {
      this.slots[collision.index] = undefined;
      this.present.delete(key);
    }

    this.evictCursorSlot();
    this.slots[this.cursor] = hash;
    this.present.set(key, { index: this.cursor, segment: segment.slice() });
    this.cursor = (this.cursor + 1) % XCODEC_WINDOW_COUNT;
    return collision !== undefined;
  }

  public dereference(index: number): Uint8Array | undefined {
    validateIndex(index);
    const hash = this.slots[index];
    if (hash === undefined) {
      return undefined;
    }

    return this.present.get(formatUint64Hex(hash))?.segment.slice();
  }

  public find(hash: bigint, segment?: Uint8Array): number | undefined {
    const key = formatUint64Hex(hash);
    const entry = this.present.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (segment !== undefined && !segmentsEqual(entry.segment, segment)) {
      return undefined;
    }
    return entry.index;
  }

  private evictCursorSlot(): void {
    const oldHash = this.slots[this.cursor];
    if (oldHash === undefined) {
      return;
    }

    this.present.delete(formatUint64Hex(oldHash));
  }
}

function validateEntry(hash: bigint, segment: Uint8Array): string {
  if (hash === 0n) {
    throw new RangeError("backref hash must be non-zero");
  }
  if (segment.length !== XCODEC_SEGMENT_LENGTH) {
    throw new RangeError("backref segment must be exactly 2048 bytes");
  }
  return formatUint64Hex(hash);
}

function validateIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= XCODEC_WINDOW_COUNT) {
    throw new RangeError("backref index must be in the range 0..255");
  }
}

function segmentsEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((byte, index) => byte === right[index]);
}
