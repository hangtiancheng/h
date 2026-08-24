export class ByteQueue {
  private readonly chunks: Uint8Array[] = [];
  private headOffset = 0;
  private queuedLength = 0;

  public get length(): number {
    return this.queuedLength;
  }

  public append(bytes: Uint8Array): void {
    if (bytes.length === 0) {
      return;
    }

    this.chunks.push(bytes.slice());
    this.queuedLength += bytes.length;
  }

  public clear(): void {
    this.chunks.length = 0;
    this.headOffset = 0;
    this.queuedLength = 0;
  }

  public indexOf(byte: number): number {
    let offset = 0;
    for (const [index, chunk] of this.chunks.entries()) {
      const start = index === 0 ? this.headOffset : 0;
      for (let cursor = start; cursor < chunk.length; cursor += 1) {
        if (chunk[cursor] === byte) {
          return offset + cursor - start;
        }
      }
      offset += chunk.length - start;
    }
    return -1;
  }

  public peek(offset = 0): number | undefined {
    if (offset < 0 || offset >= this.queuedLength) {
      return undefined;
    }

    let remaining = offset;
    for (const [index, chunk] of this.chunks.entries()) {
      const start = index === 0 ? this.headOffset : 0;
      const available = chunk.length - start;
      if (remaining < available) {
        return chunk[start + remaining];
      }
      remaining -= available;
    }
    return undefined;
  }

  public readExact(length: number): Uint8Array | undefined {
    if (length < 0 || length > this.queuedLength) {
      return undefined;
    }

    const output = new Uint8Array(length);
    let written = 0;
    while (written < length) {
      const chunk = this.chunks[0];
      if (chunk === undefined) {
        return undefined;
      }

      const available = chunk.length - this.headOffset;
      const take = Math.min(available, length - written);
      output.set(
        chunk.subarray(this.headOffset, this.headOffset + take),
        written,
      );
      this.headOffset += take;
      written += take;
      this.queuedLength -= take;

      if (this.headOffset === chunk.length) {
        this.chunks.shift();
        this.headOffset = 0;
      }
    }
    return output;
  }

  public skip(length: number): boolean {
    return this.readExact(length) !== undefined;
  }

  public toUint8Array(): Uint8Array {
    const snapshot = new Uint8Array(this.queuedLength);
    let written = 0;
    for (const [index, chunk] of this.chunks.entries()) {
      const start = index === 0 ? this.headOffset : 0;
      const slice = chunk.subarray(start);
      snapshot.set(slice, written);
      written += slice.length;
    }
    return snapshot;
  }
}
