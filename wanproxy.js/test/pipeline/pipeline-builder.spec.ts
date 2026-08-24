import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";
import { CodecSession } from "../../src/pipe-protocol/index.js";
import {
  buildCodecPipeline,
  createSessionDecodeTransform,
  createSessionEncodeTransform,
  resolvePipelineSteps,
} from "../../src/pipeline/index.js";
import { concatByteArrays } from "../../src/xcodec/index.js";

function deterministicBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 13 + 19) & 0xff);
}

function splitBytes(
  input: Uint8Array,
  sizes: readonly number[],
): readonly Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let index = 0;
  while (offset < input.length) {
    const size = sizes[index % sizes.length] ?? input.length;
    chunks.push(input.subarray(offset, Math.min(offset + size, input.length)));
    offset += size;
    index += 1;
  }
  return chunks;
}

async function runPipeline(
  input: Uint8Array,
  options: unknown,
): Promise<Uint8Array> {
  let stream = Readable.from(splitBytes(input, [1, 17, 2047, 3, 8192]));
  for (const transform of buildCodecPipeline(options).transforms) {
    stream = stream.pipe(transform);
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("expected Uint8Array output");
    }
    chunks.push(chunk);
  }
  return concatByteArrays(chunks);
}

describe("pipeline builder", () => {
  it("passes bytes through in none mode", async () => {
    const input = deterministicBytes(4097);
    await expect(
      runPipeline(input, { direction: "send", mode: "none" }),
    ).resolves.toEqual(input);
  });

  it("round-trips zlib-only pipelines", async () => {
    const input = new Uint8Array(64 * 1024).fill(0x61);
    const compressed = await runPipeline(input, {
      compressorLevel: 6,
      direction: "send",
      mode: "zlib",
    });
    const inflated = await runPipeline(compressed, {
      direction: "receive",
      mode: "zlib",
    });

    expect(compressed.length).toBeLessThan(input.length);
    expect(inflated).toEqual(input);
  });

  it("round-trips xcodec session pipelines", async () => {
    const input = new Uint8Array(2048 * 8).fill(0x42);
    const encoded = await runPipeline(input, {
      direction: "send",
      mode: "xcodec",
    });
    const decoded = await runPipeline(encoded, {
      direction: "receive",
      mode: "xcodec",
    });

    expect(decoded).toEqual(input);
  });

  it("round-trips incoming zlib plus xcodec pipelines", async () => {
    const input = new Uint8Array(2048 * 32).fill(0x7c);
    const encoded = await runPipeline(input, {
      compressorLevel: 6,
      direction: "send",
      mode: "zlib-xcodec",
      role: "incoming",
    });
    const decoded = await runPipeline(encoded, {
      direction: "receive",
      mode: "zlib-xcodec",
      role: "incoming",
    });

    expect(decoded).toEqual(input);
  });

  it("resolves C++ WANProxy direction ordering", () => {
    expect(
      resolvePipelineSteps({
        direction: "receive",
        mode: "zlib-xcodec",
        role: "incoming",
      }),
    ).toEqual(["inflate", "xcodec-decode"]);
    expect(
      resolvePipelineSteps({
        direction: "send",
        mode: "zlib-xcodec",
        role: "incoming",
      }),
    ).toEqual(["xcodec-encode", "deflate"]);
    expect(
      resolvePipelineSteps({
        direction: "receive",
        mode: "zlib-xcodec",
        role: "outgoing",
      }),
    ).toEqual(["xcodec-decode", "deflate"]);
    expect(
      resolvePipelineSteps({
        direction: "send",
        mode: "zlib-xcodec",
        role: "outgoing",
      }),
    ).toEqual(["inflate", "xcodec-encode"]);
  });

  it("validates pipeline options with zod", () => {
    expect(() =>
      buildCodecPipeline({ direction: "sideways", mode: "none" }),
    ).toThrow();
    expect(() =>
      buildCodecPipeline({
        compressorLevel: 99,
        direction: "send",
        mode: "zlib",
      }),
    ).toThrow();
  });

  it("propagates session transform errors", async () => {
    await expect(
      collectStream(
        Readable.from([Uint8Array.from([0])]).pipe(
          createSessionDecodeTransform(),
        ),
      ),
    ).rejects.toThrow("unsupported pipe protocol opcode");
    await expect(
      pipeline(
        Readable.from([]),
        createSessionEncodeTransform(new FailingCloseSession()),
      ),
    ).rejects.toThrow("close failed");
  });
});

async function collectStream(
  stream: NodeJS.ReadableStream,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("expected Uint8Array output");
    }
    chunks.push(chunk);
  }
  return concatByteArrays(chunks);
}

class FailingCloseSession extends CodecSession {
  public override closeWrite(): Uint8Array {
    throw new Error("close failed");
  }
}
