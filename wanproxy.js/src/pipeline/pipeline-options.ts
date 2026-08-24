import { z } from "zod";

export const PipelineRoleSchema = z.enum(["incoming", "outgoing"]);
export const PipelineDirectionSchema = z.enum(["receive", "send"]);
export const PipelineModeSchema = z.enum([
  "none",
  "zlib",
  "xcodec",
  "zlib-xcodec",
]);

export const PipelineOptionsSchema = z.object({
  compressorLevel: z.number().int().min(-1).max(9).optional(),
  direction: PipelineDirectionSchema,
  mode: PipelineModeSchema,
  role: PipelineRoleSchema.optional(),
});

export type PipelineOptions = z.infer<typeof PipelineOptionsSchema>;
export type PipelineDirection = z.infer<typeof PipelineDirectionSchema>;
export type PipelineMode = z.infer<typeof PipelineModeSchema>;
export type PipelineRole = z.infer<typeof PipelineRoleSchema>;
