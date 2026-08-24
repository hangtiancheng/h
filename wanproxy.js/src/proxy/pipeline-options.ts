import type { CodecConfig } from "../config/codec-config.js";
import type {
  PipelineDirection,
  PipelineOptions,
} from "../pipeline/pipeline-options.js";

export function proxyPipelineOptions(
  codec: CodecConfig,
  direction: PipelineDirection,
): PipelineOptions {
  return codec.compressorLevel === undefined
    ? { direction, mode: codec.mode, role: codec.role }
    : {
        compressorLevel: codec.compressorLevel,
        direction,
        mode: codec.mode,
        role: codec.role,
      };
}
