import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { describe, expect, it } from "vitest";

import {
  createXCodecDecodeTransform,
  createXCodecEncodeTransform,
  createXCodecTransform,
} from "@/pipeline/index.js";
import { concatByteArrays } from "@/xcodec/byte-array.js";
import {
  encodeFrame,
  XCODEC_MAGIC,
  XCODEC_SEGMENT_LENGTH,
} from "@/xcodec/index.js";

function deterministicBytes(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 29 + 11) & 0xff);
}

function splitBytes(
  input: Uint8Array,
  sizes: readonly number[],
): readonly Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let sizeIndex = 0;
  while (offset < input.length) {
    const requested = sizes[sizeIndex % sizes.length];
    const size = requested ?? input.length;
    chunks.push(input.subarray(offset, Math.min(input.length, offset + size)));
    offset += size;
    sizeIndex += 1;
  }
  return chunks;
}

async function collect(readable: NodeJS.ReadableStream): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of readable) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("expected Uint8Array stream output");
    }
    chunks.push(chunk);
  }
  return concatByteArrays(chunks);
}

async function encode(
  input: Uint8Array,
  sizes: readonly number[],
): Promise<Uint8Array> {
  return collect(
    Readable.from(splitBytes(input, sizes)).pipe(createXCodecEncodeTransform()),
  );
}

async function decode(
  input: Uint8Array,
  sizes: readonly number[],
): Promise<Uint8Array> {
  return collect(
    Readable.from(splitBytes(input, sizes)).pipe(createXCodecDecodeTransform()),
  );
}

describe("XCodec Transform streams", () => {
  it("creates transforms through the mode factory", async () => {
    const input = deterministicBytes(XCODEC_SEGMENT_LENGTH + 3);
    const encoded = await collect(
      Readable.from([input]).pipe(createXCodecTransform({ mode: "encode" })),
    );
    const decoded = await collect(
      Readable.from([encoded]).pipe(createXCodecTransform({ mode: "decode" })),
    );

    expect(decoded).toEqual(input);
  });

  it("round-trips arbitrary input chunk boundaries", async () => {
    const input = deterministicBytes(256 * 1024);
    const encoded = await encode(input, [1, 3, 31, 2047, 5, 8192]);
    const decoded = await decode(encoded, [2, 7, 17, 4095, 1, 65536]);

    expect(decoded).toEqual(input);
  });

  it("handles magic bytes and segment boundaries across chunks", async () => {
    const input = new Uint8Array(XCODEC_SEGMENT_LENGTH * 2 + 17).fill(0x41);
    input[XCODEC_SEGMENT_LENGTH - 1] = XCODEC_MAGIC;
    input[XCODEC_SEGMENT_LENGTH] = XCODEC_MAGIC;
    input[input.length - 1] = XCODEC_MAGIC;

    const encoded = await encode(input, [XCODEC_SEGMENT_LENGTH - 1, 1, 1, 13]);
    const decoded = await decode(encoded, [
      1,
      1,
      8,
      XCODEC_SEGMENT_LENGTH - 3,
      19,
    ]);

    expect(decoded).toEqual(input);
  });

  it("keeps encoder tail pending until flush", async () => {
    const input = deterministicBytes(XCODEC_SEGMENT_LENGTH - 1);
    const stream = createXCodecEncodeTransform();
    const observed: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => observed.push(chunk));

    expect(stream.write(input)).toBe(true);
    expect(observed).toHaveLength(0);
    stream.end();
    await new Promise<void>((resolve) => stream.on("end", resolve));

    expect(await decode(concatByteArrays(observed), [11])).toEqual(input);
  });

  it("propagates invalid and unknown reference errors", async () => {
    const invalid = Uint8Array.from([XCODEC_MAGIC, 0xff]);
    await expect(
      pipeline(
        Readable.from([invalid]),
        createXCodecDecodeTransform(),
        new DevNull(),
      ),
    ).rejects.toThrow("unsupported XCodec opcode 255");

    const unknownRef = encodeFrame({ hash: 1n, kind: "ref" });
    await expect(
      pipeline(
        Readable.from([unknownRef]),
        createXCodecDecodeTransform(),
        new DevNull(),
      ),
    ).rejects.toThrow("unknown XCodec hash 1");
  });

  it("rejects incomplete encoded streams at flush", async () => {
    await expect(
      pipeline(
        Readable.from([Uint8Array.from([XCODEC_MAGIC])]),
        createXCodecDecodeTransform(),
        new DevNull(),
      ),
    ).rejects.toThrow("incomplete XCodec frame at end of stream");
  });

  it("pipes through a slow writable with low highWaterMark", async () => {
    const input = new Uint8Array(XCODEC_SEGMENT_LENGTH * 64).fill(0x7b);
    const sink = new CollectingWritable();

    await pipeline(
      Readable.from(splitBytes(input, [17, 8191, 2, 4096])),
      createXCodecEncodeTransform(),
      createXCodecDecodeTransform(),
      sink,
    );

    expect(sink.bytes()).toEqual(input);
  });
});

class DevNull extends Writable {
  public override _write(
    _chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

class CollectingWritable extends Writable {
  private readonly chunks: Uint8Array[] = [];

  public constructor() {
    super({ highWaterMark: 1 });
  }

  public bytes(): Uint8Array {
    return concatByteArrays(this.chunks);
  }

  public override _write(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    if (!(chunk instanceof Uint8Array)) {
      callback(new TypeError("expected Uint8Array stream input"));
      return;
    }
    setImmediate(() => {
      this.chunks.push(chunk.slice());
      callback();
    });
  }
}
