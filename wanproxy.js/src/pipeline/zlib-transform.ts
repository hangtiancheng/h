import type { Transform } from "node:stream";
import { createDeflate, createInflate, type ZlibOptions } from "node:zlib";

export type ZlibTransformMode = "deflate" | "inflate";

export interface ZlibTransformOptions {
  readonly level?: number;
}

export function createZlibTransform(
  mode: ZlibTransformMode,
  options: ZlibTransformOptions = {},
): Transform {
  const zlibOptions: ZlibOptions =
    options.level === undefined ? {} : { level: options.level };
  switch (mode) {
    case "deflate":
      return createDeflate(zlibOptions);
    case "inflate":
      return createInflate(zlibOptions);
  }
}
