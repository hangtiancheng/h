import { randomBytes } from "node:crypto";

import { ByteQueue } from "../xcodec/byte-queue.js";
import { PIPE_HELLO_ID_LENGTH } from "./constants.js";
import { encodePipeFrame, type PipeControlFrame } from "./control-frame.js";
import { readPipeFrame } from "./control-frame-reader.js";

export type SessionReceiveResult =
  | { readonly status: "ok"; readonly frames: readonly PipeControlFrame[] }
  | { readonly status: "invalid"; readonly reason: string };

export class PipeSessionState {
  private readonly queue = new ByteQueue();
  private helloReceived = false;
  private helloSent = false;
  private eosReceived = false;
  private eosSent = false;
  private eosAckReceived = false;
  private eosAckSent = false;

  public readonly id: Uint8Array;

  public constructor(id: Uint8Array = randomBytes(PIPE_HELLO_ID_LENGTH)) {
    if (id.length !== PIPE_HELLO_ID_LENGTH) {
      throw new RangeError("session id must be exactly 16 bytes");
    }
    this.id = id.slice();
  }

  public createHello(): Uint8Array {
    if (this.helloSent) {
      return new Uint8Array();
    }
    this.helloSent = true;
    return encodePipeFrame({ id: this.id, kind: "hello" });
  }

  public createEos(): Uint8Array {
    if (this.eosSent) {
      throw new Error("EOS has already been sent");
    }
    this.eosSent = true;
    return encodePipeFrame({ kind: "eos" });
  }

  public receive(input: Uint8Array): SessionReceiveResult {
    this.queue.append(input);
    const frames: PipeControlFrame[] = [];
    for (;;) {
      const result = readPipeFrame(this.queue);
      if (result.status === "need-more") {
        return { frames, status: "ok" };
      }
      if (result.status === "invalid") {
        return { reason: result.reason, status: "invalid" };
      }
      const error = this.validateFrame(result.frame);
      if (error !== undefined) {
        return { reason: error, status: "invalid" };
      }
      frames.push(result.frame);
    }
  }

  public markEosAckSent(): void {
    if (this.eosAckSent) {
      throw new Error("EOS_ACK has already been sent");
    }
    this.eosAckSent = true;
  }

  private validateFrame(frame: PipeControlFrame): string | undefined {
    switch (frame.kind) {
      case "hello":
        if (this.helloReceived) {
          return "got HELLO twice";
        }
        this.helloReceived = true;
        return undefined;
      case "frame":
      case "learn":
        return this.helloReceived
          ? undefined
          : `got ${frame.kind.toUpperCase()} before HELLO`;
      case "ask":
      case "advance":
        return this.helloSent
          ? undefined
          : `got ${frame.kind.toUpperCase()} before sending HELLO`;
      case "eos":
        if (this.eosReceived) {
          return "duplicate EOS";
        }
        this.eosReceived = true;
        return undefined;
      case "eos-ack":
        if (!this.eosSent) {
          return "got EOS_ACK before sending EOS";
        }
        if (this.eosAckReceived) {
          return "duplicate EOS_ACK";
        }
        this.eosAckReceived = true;
        return undefined;
    }
  }
}
