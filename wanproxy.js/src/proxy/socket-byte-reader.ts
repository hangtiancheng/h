import type { Socket } from "node:net";

export class SocketByteReader {
  private readonly buffers: Buffer[] = [];
  private pending: PendingRead | undefined;
  private totalLength = 0;

  public constructor(private readonly socket: Socket) {
    this.socket.on("data", this.onData);
    this.socket.once("end", this.onEnd);
    this.socket.once("error", this.onError);
  }

  public readExact(length: number): Promise<Buffer> {
    if (!Number.isInteger(length) || length < 1) {
      return Promise.reject(new RangeError("read length must be positive"));
    }
    const existing = this.consume(length);
    if (existing !== undefined) {
      return Promise.resolve(existing);
    }
    return new Promise((resolve, reject) => {
      this.pending = { length, reject, resolve };
    });
  }

  public release(): void {
    this.socket.off("data", this.onData);
    this.socket.off("end", this.onEnd);
    this.socket.off("error", this.onError);
    for (const buffer of [...this.buffers].reverse()) {
      this.socket.unshift(buffer);
    }
    this.buffers.length = 0;
    this.totalLength = 0;
  }

  private readonly onData = (chunk: Buffer): void => {
    this.buffers.push(Buffer.from(chunk));
    this.totalLength += chunk.length;
    this.resolvePending();
  };

  private readonly onEnd = (): void => {
    this.rejectPending(new Error("socket ended during handshake"));
  };

  private readonly onError = (error: Error): void => {
    this.rejectPending(error);
  };

  private resolvePending(): void {
    if (this.pending === undefined || this.totalLength < this.pending.length) {
      return;
    }
    const pending = this.pending;
    this.pending = undefined;
    const bytes = this.consume(pending.length);
    if (bytes === undefined) {
      pending.reject(new Error("socket read buffer underflow"));
      return;
    }
    pending.resolve(bytes);
  }

  private rejectPending(error: Error): void {
    if (this.pending === undefined) {
      return;
    }
    const pending = this.pending;
    this.pending = undefined;
    pending.reject(error);
  }

  private consume(length: number): Buffer | undefined {
    if (this.totalLength < length) {
      return undefined;
    }
    const output = Buffer.allocUnsafe(length);
    let offset = 0;
    while (offset < length) {
      const first = this.buffers.shift();
      if (first === undefined) {
        throw new Error("socket read buffer is inconsistent");
      }
      const copied = first.copy(output, offset, 0, length - offset);
      offset += copied;
      if (copied < first.length) {
        this.buffers.unshift(first.subarray(copied));
      }
    }
    this.totalLength -= length;
    return output;
  }
}

interface PendingRead {
  readonly length: number;
  readonly reject: (error: Error) => void;
  readonly resolve: (bytes: Buffer) => void;
}
