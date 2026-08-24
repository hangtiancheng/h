#!/usr/bin/env node

import { open, stat } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { performance } from "node:perf_hooks";
import { isMainThread, Worker } from "node:worker_threads";

import {
  type CreateRandomFileOptions,
  CreateRandomFileOptionsSchema,
  type CreateRandomFileResult,
  DEFAULT_CHUNK_BYTES,
  DEFAULT_MAX_WORKERS,
  GIB,
  MIB,
  WorkerDoneMessageSchema,
} from "./create-large-file-schema.js";

export async function createRandomFile(
  options: CreateRandomFileOptions,
): Promise<CreateRandomFileResult> {
  const parsed = CreateRandomFileOptionsSchema.parse(options);
  const workers =
    parsed.workers ?? Math.min(DEFAULT_MAX_WORKERS, availableParallelism());
  const chunkBytes = parsed.chunkBytes ?? DEFAULT_CHUNK_BYTES;
  const totalBytes = parsed.sizeGB * GIB;
  const startedAt = performance.now();

  await preallocateFile(parsed.output, totalBytes);
  await Promise.all(
    partitionRanges(totalBytes, workers).map(([start, end]) =>
      runWorkerRange({ chunkBytes, end, path: parsed.output, start }),
    ),
  );

  const { size } = await stat(parsed.output);
  const elapsedSec = (performance.now() - startedAt) / 1000;
  return { bytes: size, elapsedSec, throughputGiBs: size / GIB / elapsedSec };
}

async function preallocateFile(
  output: string,
  totalBytes: number,
): Promise<void> {
  const fh = await open(output, "w");
  try {
    await fh.truncate(totalBytes);
  } finally {
    await fh.close();
  }
}

function partitionRanges(
  totalBytes: number,
  workers: number,
): readonly (readonly [number, number])[] {
  const sliceSize = Math.ceil(totalBytes / workers);
  const ranges: (readonly [number, number])[] = [];
  for (let index = 0; index < workers; index += 1) {
    const start = index * sliceSize;
    const end = Math.min(start + sliceSize, totalBytes);
    if (start < end) {
      ranges.push([start, end]);
    }
  }
  return ranges;
}

function runWorkerRange(payload: {
  readonly chunkBytes: number;
  readonly end: number;
  readonly path: string;
  readonly start: number;
}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./create-large-file-worker.js", import.meta.url),
      {
        workerData: payload,
      },
    );
    worker.once("message", (message: unknown) =>
      resolve(WorkerDoneMessageSchema.parse(message)),
    );
    worker.once("error", reject);
    worker.once("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`worker exited with non-zero code ${code}`));
      }
    });
  });
}

function parseCli(argv: readonly string[]): CreateRandomFileOptions {
  const output = argv[2];
  const sizeText = argv[3];
  if (output === undefined || sizeText === undefined) {
    throw new Error(
      "Usage: create-large-file <output> <sizeGB> [--workers=N] [--chunkMiB=M]",
    );
  }

  const args: MutableCliArgs = { output, sizeGB: Number(sizeText) };
  for (const flag of argv.slice(4)) {
    const match = /^--(\w+)=(.+)$/.exec(flag);
    if (match === null) {
      throw new Error(`unrecognized argument: ${flag}`);
    }
    applyCliFlag(args, match[1] ?? "", match[2] ?? "");
  }
  return CreateRandomFileOptionsSchema.parse(args);
}

function applyCliFlag(args: MutableCliArgs, key: string, value: string): void {
  switch (key) {
    case "workers":
      args.workers = Number(value);
      return;
    case "chunkMiB":
      args.chunkBytes = Number(value) * MIB;
      return;
    default:
      throw new Error(`unknown flag: --${key}`);
  }
}

interface MutableCliArgs {
  chunkBytes?: number;
  output: string;
  sizeGB: number;
  workers?: number;
}

if (isMainThread && import.meta.url === `file://${process.argv[1]}`) {
  try {
    const result = await createRandomFile(parseCli(process.argv));
    console.log(
      `Done: ${(result.bytes / GIB).toFixed(2)} GiB in ${result.elapsedSec.toFixed(2)}s`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : "unknown error");
    process.exit(1);
  }
}
