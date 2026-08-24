import { describe, expect, it } from "vitest";

import { ByteQueue } from "../../src/xcodec/index.js";

describe("ByteQueue", () => {
  it("appends, peeks, reads, skips, snapshots, and clears", () => {
    const queue = new ByteQueue();
    queue.append(Uint8Array.from([1, 2]));
    queue.append(new Uint8Array());
    queue.append(Uint8Array.from([3, 4, 5]));

    expect(queue.length).toBe(5);
    expect(queue.indexOf(4)).toBe(3);
    expect(queue.indexOf(9)).toBe(-1);
    expect(queue.peek()).toBe(1);
    expect(queue.peek(3)).toBe(4);
    expect(queue.peek(-1)).toBeUndefined();
    expect(queue.peek(5)).toBeUndefined();
    expect(queue.readExact(3)).toEqual(Uint8Array.from([1, 2, 3]));
    expect(queue.indexOf(4)).toBe(0);
    expect(queue.toUint8Array()).toEqual(Uint8Array.from([4, 5]));
    expect(queue.skip(1)).toBe(true);
    expect(queue.readExact(2)).toBeUndefined();
    expect(queue.readExact(1)).toEqual(Uint8Array.from([5]));
    queue.clear();
    expect(queue.length).toBe(0);
  });
});
