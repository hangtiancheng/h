export function encodeUint16BE(value: number): Uint8Array {
  validateUnsigned(value, 0xffff, "uint16");
  return Uint8Array.from([(value >>> 8) & 0xff, value & 0xff]);
}

export function decodeUint16BE(bytes: Uint8Array): number {
  if (bytes.length !== 2) {
    throw new RangeError("uint16 requires exactly 2 bytes");
  }
  return (bytes[0] ?? 0) * 0x100 + (bytes[1] ?? 0);
}

export function encodeUint32BE(value: number): Uint8Array {
  validateUnsigned(value, 0xffff_ffff, "uint32");
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

export function decodeUint32BE(bytes: Uint8Array): number {
  if (bytes.length !== 4) {
    throw new RangeError("uint32 requires exactly 4 bytes");
  }
  return (
    (bytes[0] ?? 0) * 0x1_0000_00 +
    ((bytes[1] ?? 0) << 16) +
    ((bytes[2] ?? 0) << 8) +
    (bytes[3] ?? 0)
  );
}

function validateUnsigned(value: number, max: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${name} value is out of range`);
  }
}
