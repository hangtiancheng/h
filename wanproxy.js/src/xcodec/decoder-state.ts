import type { ByteQueue } from "./byte-queue.js";
import { XCODEC_MAGIC } from "./constants.js";

export function readRawPrefix(queue: ByteQueue): Uint8Array | undefined {
  const magicIndex = queue.indexOf(XCODEC_MAGIC);
  if (magicIndex > 0) {
    return queue.readExact(magicIndex);
  }
  if (magicIndex === -1 && queue.length > 0) {
    return queue.readExact(queue.length);
  }
  return undefined;
}
