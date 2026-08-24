import { concatByteArrays } from "../xcodec/byte-array.js";
import { XCodecDecoder } from "../xcodec/decoder.js";
import { XCodecEncoder } from "../xcodec/encoder.js";
import { MemoryCache } from "../xcodec/memory-cache.js";
import { PIPE_MAX_PAYLOAD_FRAME } from "./constants.js";
import { encodePipeFrame, type PipeControlFrame } from "./control-frame.js";
import { collectUnknownReferences } from "./frame-scanner.js";
import { ReferenceRetention } from "./reference-retention.js";
import {
  answerAsk,
  applyAdvance,
  applyLearnSegments,
} from "./session-actions.js";
import {
  type CodecSessionReceiveResult,
  invalid,
  ok,
} from "./session-result.js";
import { PipeSessionState } from "./session-state.js";

export interface CodecSessionOptions {
  readonly id?: Uint8Array;
  readonly cache?: MemoryCache;
}

export class CodecSession {
  private readonly cache: MemoryCache;
  private readonly decoder: XCodecDecoder;
  private readonly encoder: XCodecEncoder;
  private readonly pendingFrames: Uint8Array[] = [];
  private readonly retention = new ReferenceRetention();
  private readonly state: PipeSessionState;
  private readonly unknownHashes = new Set<bigint>();

  public constructor(options: CodecSessionOptions = {}) {
    this.cache = options.cache ?? new MemoryCache();
    this.decoder = new XCodecDecoder({ cache: this.cache });
    this.encoder = new XCodecEncoder({ cache: this.cache });
    this.state = new PipeSessionState(options.id);
  }

  public encodeData(input: Uint8Array): Uint8Array {
    const output: Uint8Array[] = [this.state.createHello()];
    let offset = 0;
    while (offset < input.length) {
      const chunk = input.subarray(offset, offset + PIPE_MAX_PAYLOAD_FRAME);
      const result = this.encoder.encodeWithReferences(chunk);
      this.retention.push(result.references);
      output.push(encodePipeFrame({ kind: "frame", payload: result.encoded }));
      offset += chunk.length;
    }
    return concatByteArrays(output);
  }

  public closeWrite(): Uint8Array {
    return concatByteArrays([this.state.createHello(), this.state.createEos()]);
  }

  public receive(input: Uint8Array): CodecSessionReceiveResult {
    const parsed = this.state.receive(input);
    if (parsed.status === "invalid") {
      return invalid(parsed.reason);
    }

    const output: Uint8Array[] = [];
    const responses: Uint8Array[] = [];
    for (const frame of parsed.frames) {
      const handled = this.handleFrame(frame);
      if (handled.status === "invalid") {
        return handled;
      }
      output.push(handled.output);
      responses.push(handled.responses);
    }
    return {
      output: concatByteArrays(output),
      responses: concatByteArrays(responses),
      status: "ok",
    };
  }

  private handleFrame(frame: PipeControlFrame): CodecSessionReceiveResult {
    switch (frame.kind) {
      case "hello":
        return ok();
      case "frame":
        this.pendingFrames.push(frame.payload);
        return this.drainPendingFrames();
      case "ask":
        return answerAsk(this.retention, frame.hashes);
      case "learn":
        return this.applyLearn(frame.segments);
      case "advance":
        return applyAdvance(this.retention, frame.count);
      case "eos":
        this.state.markEosAckSent();
        return {
          output: new Uint8Array(),
          responses: encodePipeFrame({ kind: "eos-ack" }),
          status: "ok",
        };
      case "eos-ack":
        return ok();
    }
  }

  private drainPendingFrames(): CodecSessionReceiveResult {
    const output: Uint8Array[] = [];
    const responses: Uint8Array[] = [];
    let advanced = 0;

    while (this.pendingFrames.length > 0) {
      const frame = this.pendingFrames[0];
      if (frame === undefined) {
        break;
      }
      const unknown = collectUnknownReferences(frame, this.cache);
      if (unknown.length > 0) {
        for (const hash of unknown) {
          this.unknownHashes.add(hash);
        }
        responses.push(encodePipeFrame({ hashes: unknown, kind: "ask" }));
        break;
      }
      const decoded = this.decoder.decode(frame);
      if (decoded.status === "invalid") {
        return invalid(decoded.reason);
      }
      if (decoded.status === "unknown-hash") {
        return invalid("unexpected unresolved hash after scan");
      }
      output.push(decoded.output);
      this.pendingFrames.shift();
      advanced += 1;
    }

    if (advanced > 0) {
      responses.unshift(encodePipeFrame({ count: advanced, kind: "advance" }));
    }
    return {
      output: concatByteArrays(output),
      responses: concatByteArrays(responses),
      status: "ok",
    };
  }

  private applyLearn(
    segments: readonly Uint8Array[],
  ): CodecSessionReceiveResult {
    const learned = applyLearnSegments(
      this.cache,
      this.unknownHashes,
      segments,
    );
    return learned.status === "invalid" ? learned : this.drainPendingFrames();
  }
}
