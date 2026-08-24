import type { Socket } from "node:net";

import { SocketByteReader } from "./socket-byte-reader.js";

export interface SocksConnectRequest {
  readonly host: string;
  readonly port: number;
  readonly releaseBufferedData: () => void;
  readonly version: 4 | 5;
}

export async function readSocksConnectRequest(
  socket: Socket,
): Promise<SocksConnectRequest> {
  const reader = new SocketByteReader(socket);
  const version = (await reader.readExact(1))[0];
  if (version === 0x04) {
    return readSocks4Request(reader);
  }
  if (version === 0x05) {
    return readSocks5Request(socket, reader);
  }
  throw new Error("unsupported SOCKS version");
}

export function createSocksSuccessResponse(
  request: SocksConnectRequest,
): Buffer {
  if (request.version === 4) {
    return Buffer.from([0x00, 0x5a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  }
  return Buffer.from([
    0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
}

async function readSocks4Request(
  reader: SocketByteReader,
): Promise<SocksConnectRequest> {
  const command = (await reader.readExact(1))[0];
  if (command !== 0x01) {
    throw new Error("unsupported SOCKS4 command");
  }
  const port = (await reader.readExact(2)).readUInt16BE(0);
  const address = await reader.readExact(4);
  await readNullTerminated(reader);
  return {
    host: Array.from(address).join("."),
    port,
    releaseBufferedData: () => reader.release(),
    version: 4,
  };
}

async function readSocks5Request(
  socket: Socket,
  reader: SocketByteReader,
): Promise<SocksConnectRequest> {
  const methodCount = (await reader.readExact(1))[0];
  if (methodCount === undefined || methodCount < 1) {
    throw new Error("SOCKS5 method count is invalid");
  }
  const methods = await reader.readExact(methodCount);
  if (!methods.includes(0x00)) {
    throw new Error("SOCKS5 no-auth method is required");
  }
  socket.write(Buffer.from([0x05, 0x00]));

  const header = await reader.readExact(4);
  if (header[0] !== 0x05 || header[1] !== 0x01 || header[2] !== 0x00) {
    throw new Error("unsupported SOCKS5 request");
  }
  const host = await readSocks5Host(reader, header[3]);
  const port = (await reader.readExact(2)).readUInt16BE(0);
  return {
    host,
    port,
    releaseBufferedData: () => reader.release(),
    version: 5,
  };
}

async function readSocks5Host(
  reader: SocketByteReader,
  addressType: number | undefined,
): Promise<string> {
  switch (addressType) {
    case 0x01:
      return Array.from(await reader.readExact(4)).join(".");
    case 0x03: {
      const length = (await reader.readExact(1))[0];
      if (length === undefined || length < 1) {
        throw new Error("SOCKS5 domain length is invalid");
      }
      return (await reader.readExact(length)).toString("utf8");
    }
    case 0x04:
      return formatIpv6(await reader.readExact(16));
    default:
      throw new Error("unsupported SOCKS5 address type");
  }
}

async function readNullTerminated(reader: SocketByteReader): Promise<void> {
  for (;;) {
    if ((await reader.readExact(1))[0] === 0x00) {
      return;
    }
  }
}

function formatIpv6(bytes: Buffer): string {
  const groups: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 2) {
    groups.push(bytes.readUInt16BE(offset).toString(16));
  }
  return groups.join(":");
}
