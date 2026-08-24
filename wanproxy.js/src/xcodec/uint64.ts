const UINT64_MASK = 0xffff_ffff_ffff_ffffn;
const UINT64_BYTES = 8;

export function encodeUint64BE(value: bigint): Uint8Array {
  if (value < 0n || value > UINT64_MASK) {
    throw new RangeError("uint64 value is out of range");
  }

  const bytes = new Uint8Array(UINT64_BYTES);
  for (let index = UINT64_BYTES - 1; index >= 0; index -= 1) {
    bytes[index] = Number(
      (value >> BigInt((UINT64_BYTES - 1 - index) * 8)) & 0xffn,
    );
  }
  return bytes;
}

export function decodeUint64BE(bytes: Uint8Array): bigint {
  if (bytes.length !== UINT64_BYTES) {
    throw new RangeError("uint64 requires exactly 8 bytes");
  }

  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

export function formatUint64Hex(value: bigint): string {
  if (value < 0n || value > UINT64_MASK) {
    throw new RangeError("uint64 value is out of range");
  }
  return value.toString(16).padStart(16, "0");
}
