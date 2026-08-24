import { Transform, type TransformCallback } from "node:stream";

import {
  CodecSession,
  type CodecSessionOptions,
} from "../pipe-protocol/codec-session.js";
import { parseStreamChunk } from "./stream-chunk.js";

export type SessionTransformMode = "encode" | "decode";

export function createSessionEncodeTransform(
  session = new CodecSession(),
): Transform {
  return new SessionEncodeTransform(session);
}

export function createSessionDecodeTransform(
  session = new CodecSession(),
): Transform {
  return new SessionDecodeTransform(session);
}

export function createSessionPair(options: CodecSessionOptions = {}): {
  readonly encode: Transform;
  readonly decode: Transform;
} {
  const encodeSession = new CodecSession(options);
  const decodeSession = new CodecSession(options);
  return {
    decode: new SessionDecodeTransform(decodeSession),
    encode: new SessionEncodeTransform(encodeSession),
  };
}

class SessionEncodeTransform extends Transform {
  public constructor(private readonly session: CodecSession) {
    super();
  }

  public override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const encoded = this.session.encodeData(parseStreamChunk(chunk));
      if (encoded.length > 0) {
        this.push(Buffer.from(encoded));
      }
      callback();
    } catch (error) {
      callback(toError(error));
    }
  }

  public override _flush(callback: TransformCallback): void {
    try {
      this.push(Buffer.from(this.session.closeWrite()));
      callback();
    } catch (error) {
      callback(toError(error));
    }
  }
}

class SessionDecodeTransform extends Transform {
  public constructor(private readonly session: CodecSession) {
    super();
  }

  public override _transform(
    chunk: unknown,
    _encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    try {
      const decoded = this.session.receive(parseStreamChunk(chunk));
      if (decoded.status === "invalid") {
        callback(new Error(decoded.reason));
        return;
      }
      if (decoded.output.length > 0) {
        this.push(Buffer.from(decoded.output));
      }
      callback();
    } catch (error) {
      callback(toError(error));
    }
  }
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error("unknown session transform error");
}
