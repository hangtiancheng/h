import { z } from "zod";

const Uint8ArraySchema = z.custom<Uint8Array>(
  (value) => value instanceof Uint8Array,
  {
    message: "stream chunk must be a Uint8Array",
  },
);

export function parseStreamChunk(chunk: unknown): Uint8Array {
  return Uint8ArraySchema.parse(chunk);
}
