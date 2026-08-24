import { PassThrough } from "node:stream";

export function createPassThroughTransform(): PassThrough {
  return new PassThrough();
}
