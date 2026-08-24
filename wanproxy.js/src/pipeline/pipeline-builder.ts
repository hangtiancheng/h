import type { Transform } from "node:stream";

import { CodecSession } from "../pipe-protocol/codec-session.js";
import type { MemoryCache } from "../xcodec/memory-cache.js";
import { createPassThroughTransform } from "./pass-through-transform.js";
import {
  type PipelineOptions,
  PipelineOptionsSchema,
} from "./pipeline-options.js";
import {
  createSessionDecodeTransform,
  createSessionEncodeTransform,
} from "./session-transform.js";
import { createZlibTransform } from "./zlib-transform.js";

export interface PipelineRuntimeDeps {
  readonly cache?: MemoryCache;
}

export interface PipelineBuildResult {
  readonly steps: readonly string[];
  readonly transforms: readonly Transform[];
}

export function buildCodecPipeline(
  input: unknown,
  deps: PipelineRuntimeDeps = {},
): PipelineBuildResult {
  const options = PipelineOptionsSchema.parse(input);
  const steps = resolveSteps(options);
  const transforms = steps.map((step) => createStep(step, options, deps));
  return { steps, transforms };
}

export function resolvePipelineSteps(input: unknown): readonly string[] {
  return resolveSteps(PipelineOptionsSchema.parse(input));
}

function resolveSteps(options: PipelineOptions): readonly string[] {
  if (options.mode === "none") {
    return ["pass-through"];
  }
  if (options.mode === "zlib") {
    return [zlibStep(options.direction)];
  }
  if (options.mode === "xcodec") {
    return [xcodecStep(options.direction)];
  }
  return resolveZlibXcodecSteps(options);
}

function resolveZlibXcodecSteps(options: PipelineOptions): readonly string[] {
  const role = options.role ?? "incoming";
  if (role === "incoming") {
    return options.direction === "receive"
      ? ["inflate", "xcodec-decode"]
      : ["xcodec-encode", "deflate"];
  }
  return options.direction === "receive"
    ? ["xcodec-decode", "deflate"]
    : ["inflate", "xcodec-encode"];
}

function zlibStep(direction: PipelineOptions["direction"]): string {
  return direction === "receive" ? "inflate" : "deflate";
}

function xcodecStep(direction: PipelineOptions["direction"]): string {
  return direction === "receive" ? "xcodec-decode" : "xcodec-encode";
}

function createStep(
  step: string,
  options: PipelineOptions,
  deps: PipelineRuntimeDeps,
): Transform {
  switch (step) {
    case "pass-through":
      return createPassThroughTransform();
    case "inflate":
      return createZlibTransform("inflate", zlibOptions(options));
    case "deflate":
      return createZlibTransform("deflate", zlibOptions(options));
    case "xcodec-encode":
      return createSessionEncodeTransform(
        new CodecSession(deps.cache ? { cache: deps.cache } : {}),
      );
    case "xcodec-decode":
      return createSessionDecodeTransform(
        new CodecSession(deps.cache ? { cache: deps.cache } : {}),
      );
    default:
      throw new Error(`unsupported pipeline step ${step}`);
  }
}

function zlibOptions(options: PipelineOptions): { readonly level?: number } {
  return options.compressorLevel === undefined
    ? {}
    : { level: options.compressorLevel };
}
