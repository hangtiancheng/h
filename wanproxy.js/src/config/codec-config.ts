import { z } from "zod";

import {
  PipelineModeSchema,
  PipelineRoleSchema,
} from "../pipeline/pipeline-options.js";

export const CodecConfigSchema = z.object({
  compressorLevel: z.number().int().min(-1).max(9).optional(),
  mode: PipelineModeSchema.default("none"),
  role: PipelineRoleSchema.default("incoming"),
});

export type CodecConfig = z.infer<typeof CodecConfigSchema>;
