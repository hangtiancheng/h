import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function hashFile(path: string): Promise<string> {
  const sink = createHashSink();
  await pipeline(createReadStream(path), sink.stream);
  return sink.digest();
}

export function createHashSink(): {
  readonly digest: () => string;
  readonly stream: Writable;
} {
  const hash = createHash("sha256");
  const stream = new Writable({
    write(chunk: unknown, _encoding: BufferEncoding, callback) {
      if (Buffer.isBuffer(chunk) || chunk instanceof Uint8Array) {
        hash.update(chunk);
        callback();
        return;
      }
      callback(new Error("hash sink received a non-byte chunk"));
    },
  });
  return {
    digest: () => hash.digest("hex"),
    stream,
  };
}
