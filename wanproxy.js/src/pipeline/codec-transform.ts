import { Transform, type TransformCallback } from "node:stream";

import { concatByteArrays } from "../xcodec/byte-array.js";
import { XCODEC_SEGMENT_LENGTH } from "../xcodec/constants.js";
import { type DecoderOptions, XCodecDecoder } from "../xcodec/decoder.js";
import { type EncoderOptions, XCodecEncoder } from "../xcodec/encoder.js";
import { parseStreamChunk } from "./stream-chunk.js";

export type CodecTransformMode = "encode" | "decode";

export interface CodecTransformOptions {
  readonly mode: CodecTransformMode;
  readonly decoder?: DecoderOptions;
  readonly encoder?: EncoderOptions;
}

export function createXCodecEncodeTransform(
  options: EncoderOptions = {},
): Transform {
  return new XCodecEncodeTransform(options);
}

export function createXCodecDecodeTransform(
  options: DecoderOptions = {},
): Transform {
  return new XCodecDecodeTransform(options);
}

export function createXCodecTransform(
  options: CodecTransformOptions,
): Transform {
  switch (options.mode) {
    case "encode":
      return createXCodecEncodeTransform(options.encoder);
    case "decode":
      return createXCodecDecodeTransform(options.decoder);
  }
}

class XCodecEncodeTransform extends Transform {
  private readonly encoder: XCodecEncoder;
  private pending = new Uint8Array();

  public constructor(options: EncoderOptions) {
    super();
    this.encoder = new XCodecEncoder(options);
  }

  public override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const bytes = parseStreamChunk(chunk);
      const input = concatByteArrays([this.pending, bytes]);
      const fullLength = input.length - (input.length % XCODEC_SEGMENT_LENGTH);
      this.pending = input.subarray(fullLength).slice();

      if (fullLength > 0) {
        this.pushEncoded(input.subarray(0, fullLength));
      }
      callback();
    } catch (error) {
      callback(toError(error));
    }
  }

  public override _flush(callback: TransformCallback): void {
    try {
      if (this.pending.length > 0) {
        this.pushEncoded(this.pending);
        this.pending = new Uint8Array();
      }
      callback();
    } catch (error) {
      callback(toError(error));
    }
  }

  private pushEncoded(bytes: Uint8Array): void {
    const encoded = this.encoder.encode(bytes);
    if (encoded.length > 0) {
      this.push(Buffer.from(encoded));
    }
  }
}

class XCodecDecodeTransform extends Transform {
  private readonly decoder: XCodecDecoder;

  public constructor(options: DecoderOptions) {
    super();
    this.decoder = new XCodecDecoder(options);
  }

  public override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const result = this.decoder.decode(parseStreamChunk(chunk));
      if (result.output.length > 0) {
        this.push(Buffer.from(result.output));
      }
      if (result.status === "invalid") {
        callback(new Error(result.reason));
        return;
      }
      if (result.status === "unknown-hash") {
        callback(
          new Error(
            `unknown XCodec hash ${result.hashes[0]?.toString(16) ?? ""}`,
          ),
        );
        return;
      }
      callback();
    } catch (error) {
      callback(toError(error));
    }
  }

  public override _flush(callback: TransformCallback): void {
    const result = this.decoder.decode(new Uint8Array());
    if (result.output.length > 0) {
      this.push(Buffer.from(result.output));
    }
    if (result.status === "need-more") {
      callback(new Error("incomplete XCodec frame at end of stream"));
      return;
    }
    callback();
  }
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("unknown stream transform error");
}
