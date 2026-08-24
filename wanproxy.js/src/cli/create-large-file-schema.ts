import { z } from "zod";

export const GIB = 1024 ** 3;
export const MIB = 1024 ** 2;
export const DEFAULT_CHUNK_BYTES = 4 * MIB;
export const DEFAULT_MAX_WORKERS = 8;

export const CreateRandomFileOptionsSchema = z.object({
  chunkBytes: z.number().int().positive().optional(),
  output: z.string().min(1),
  sizeGB: z.number().int().positive(),
  workers: z.number().int().positive().optional(),
});

export const WorkerPayloadSchema = z.object({
  chunkBytes: z.number().int().positive(),
  end: z.number().int().nonnegative(),
  path: z.string().min(1),
  start: z.number().int().nonnegative(),
});

export const WorkerDoneMessageSchema = z.object({
  end: z.number().int().nonnegative(),
  start: z.number().int().nonnegative(),
  written: z.number().int().nonnegative(),
});

export type CreateRandomFileOptions = z.infer<
  typeof CreateRandomFileOptionsSchema
>;
export type WorkerDoneMessage = z.infer<typeof WorkerDoneMessageSchema>;
export type WorkerPayload = z.infer<typeof WorkerPayloadSchema>;

export interface CreateRandomFileResult {
  readonly bytes: number;
  readonly elapsedSec: number;
  readonly throughputGiBs: number;
}
