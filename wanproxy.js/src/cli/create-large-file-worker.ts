import { randomFillSync } from "node:crypto";
import { open } from "node:fs/promises";
import { parentPort, workerData } from "node:worker_threads";

import { WorkerPayloadSchema } from "./create-large-file-schema.js";

const payload = WorkerPayloadSchema.parse(workerData);
const port = parentPort;
if (port === null) {
  throw new Error("worker parent port is unavailable");
}

const fh = await open(payload.path, "r+");
const buffer = Buffer.allocUnsafe(payload.chunkBytes);
try {
  let offset = payload.start;
  while (offset < payload.end) {
    const remaining = payload.end - offset;
    const writeSize = Math.min(payload.chunkBytes, remaining);
    const view =
      writeSize === payload.chunkBytes ? buffer : buffer.subarray(0, writeSize);
    randomFillSync(view);
    await fh.write(view, 0, writeSize, offset);
    offset += writeSize;
  }
} finally {
  await fh.close();
}

port.postMessage({
  end: payload.end,
  start: payload.start,
  written: payload.end - payload.start,
});
process.exit(0);
