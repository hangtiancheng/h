import { z } from "zod";

export const LargeFileHarnessOptionsSchema = z.object({
  cacheSegments: z.number().int().positive(),
  chunkMiB: z.number().int().positive().optional(),
  file: z.string().min(1),
  force: z.boolean(),
  json: z.boolean(),
  projectRoot: z.string().min(1),
  sizeGB: z.number().int().positive(),
  skipBuild: z.boolean(),
  workers: z.number().int().positive().optional(),
});

export type LargeFileHarnessOptions = z.infer<
  typeof LargeFileHarnessOptionsSchema
>;

export function parseLargeFileHarnessOptions(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  projectRoot: string,
): LargeFileHarnessOptions {
  const args = {
    cacheSegments: numberFrom(envValue(env, "LARGE_FILE_CACHE_SEGMENTS"), 4096),
    chunkMiB: optionalNumberFrom(envValue(env, "LARGE_FILE_CHUNK_MIB")),
    file: envValue(env, "LARGE_FILE_PATH") ?? "large-xcodec-fixture.bin",
    force: envValue(env, "LARGE_FILE_FORCE") === "1",
    json: envValue(env, "LARGE_FILE_JSON") === "1",
    projectRoot,
    sizeGB: numberFrom(envValue(env, "LARGE_FILE_SIZE_GB"), 3),
    skipBuild: envValue(env, "LARGE_FILE_SKIP_BUILD") === "1",
    workers: optionalNumberFrom(envValue(env, "LARGE_FILE_WORKERS")),
  };

  for (const flag of argv) {
    applyFlag(args, flag);
  }
  return LargeFileHarnessOptionsSchema.parse(args);
}

function applyFlag(
  args: {
    cacheSegments: number;
    chunkMiB: number | undefined;
    file: string;
    force: boolean;
    json: boolean;
    sizeGB: number;
    skipBuild: boolean;
    workers: number | undefined;
  },
  flag: string,
): void {
  if (flag === "--force") {
    args.force = true;
    return;
  }
  if (flag === "--json") {
    args.json = true;
    return;
  }
  if (flag === "--skip-build") {
    args.skipBuild = true;
    return;
  }
  const match = /^--([a-z-]+)=(.+)$/.exec(flag);
  if (match === null) {
    throw new Error(`unknown argument: ${flag}`);
  }
  applyKeyValueFlag(args, match[1] ?? "", match[2] ?? "");
}

function applyKeyValueFlag(
  args: {
    cacheSegments: number;
    chunkMiB: number | undefined;
    file: string;
    sizeGB: number;
    workers: number | undefined;
  },
  key: string,
  value: string,
): void {
  switch (key) {
    case "cache-segments":
      args.cacheSegments = Number(value);
      return;
    case "chunk-mib":
      args.chunkMiB = Number(value);
      return;
    case "file":
      args.file = value;
      return;
    case "size-gb":
      args.sizeGB = Number(value);
      return;
    case "workers":
      args.workers = Number(value);
      return;
    default:
      throw new Error(`unknown argument: --${key}`);
  }
}

function numberFrom(value: string | undefined, fallback: number): number {
  return value === undefined ? fallback : Number(value);
}

function optionalNumberFrom(value: string | undefined): number | undefined {
  return value === undefined ? undefined : Number(value);
}

function envValue(env: NodeJS.ProcessEnv, key: string): string | undefined {
  return env[key];
}
