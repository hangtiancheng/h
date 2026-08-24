export class ReferenceRetention {
  private readonly frames: ReadonlyMap<bigint, Uint8Array>[] = [];

  public get size(): number {
    return this.frames.length;
  }

  public push(frame: ReadonlyMap<bigint, Uint8Array>): void {
    this.frames.push(frame);
  }

  public advance(count: number): void {
    if (!Number.isInteger(count) || count < 1 || count > this.frames.length) {
      throw new Error("invalid frame advance count");
    }
    this.frames.splice(0, count);
  }

  public learn(hashes: readonly bigint[]): readonly Uint8Array[] {
    const segments: Uint8Array[] = [];
    for (const hash of hashes) {
      const segment = this.find(hash);
      if (segment === undefined) {
        throw new Error("hash in ASK could not be found");
      }
      segments.push(segment);
    }
    return segments;
  }

  private find(hash: bigint): Uint8Array | undefined {
    for (const frame of this.frames) {
      const segment = frame.get(hash);
      if (segment !== undefined) {
        return segment.slice();
      }
    }
    return undefined;
  }
}
