export interface XCodecCache {
  readonly size: number;
  enter(hash: bigint, segment: Uint8Array): void;
  has(hash: bigint): boolean;
  lookup(hash: bigint): Uint8Array | undefined;
  replace(hash: bigint, segment: Uint8Array): void;
}
