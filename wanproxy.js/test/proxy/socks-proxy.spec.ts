import { once } from "node:events";
import { connect, createServer, type Server, type Socket } from "node:net";
import { describe, expect, it } from "vitest";

import { SocksProxyServer } from "../../src/proxy/index.js";
import { concatByteArrays } from "../../src/xcodec/index.js";

async function listen(server: Server): Promise<number> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not bind to a TCP address");
  }
  return address.port;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error === undefined ? resolve() : reject(error)));
  });
}

async function createEchoServer(): Promise<{
  readonly port: number;
  readonly server: Server;
}> {
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.on("data", (chunk: Uint8Array) => socket.write(chunk));
    socket.on("end", () => socket.end());
  });
  return { port: await listen(server), server };
}

describe("SocksProxyServer", () => {
  it("relays SOCKS5 IPv4 CONNECT traffic", async () => {
    const echo = await createEchoServer();
    const proxy = new SocksProxyServer({
      listen: { host: "127.0.0.1", port: 0 },
      name: "socks5-ipv4",
    });
    try {
      await proxy.start();
      await expect(
        requestViaSocks5(proxy.address.port, echo.port),
      ).resolves.toEqual(Uint8Array.from(Buffer.from("socks5-ipv4")));
    } finally {
      await proxy.stop();
      await close(echo.server);
    }
  });

  it("relays SOCKS5 domain CONNECT traffic", async () => {
    const echo = await createEchoServer();
    const proxy = new SocksProxyServer({
      listen: { host: "127.0.0.1", port: 0 },
      name: "socks5-domain",
    });
    try {
      await proxy.start();
      await expect(
        requestViaSocks5Domain(proxy.address.port, echo.port),
      ).resolves.toEqual(Uint8Array.from(Buffer.from("socks5-domain")));
    } finally {
      await proxy.stop();
      await close(echo.server);
    }
  });

  it("relays SOCKS4 CONNECT traffic", async () => {
    const echo = await createEchoServer();
    const proxy = new SocksProxyServer({
      listen: { host: "127.0.0.1", port: 0 },
      name: "socks4",
    });
    try {
      await proxy.start();
      await expect(
        requestViaSocks4(proxy.address.port, echo.port),
      ).resolves.toEqual(Uint8Array.from(Buffer.from("socks4")));
    } finally {
      await proxy.stop();
      await close(echo.server);
    }
  });

  it("closes unsupported SOCKS versions", async () => {
    const proxy = new SocksProxyServer({
      listen: { host: "127.0.0.1", port: 0 },
      name: "bad-socks",
    });
    try {
      await proxy.start();
      const socket = connect(proxy.address.port, "127.0.0.1");
      await once(socket, "connect");
      socket.write(Buffer.from([0x06]));
      await once(socket, "close");
      expect(socket.destroyed).toBe(true);
    } finally {
      await proxy.stop();
    }
  });

  it("reports status before listening and supports idempotent stop", async () => {
    const proxy = new SocksProxyServer({
      listen: { host: "127.0.0.1", port: 0 },
      name: "idle-socks",
    });

    expect(() => proxy.address).toThrow("not listening");
    expect(proxy.status()).toMatchObject({
      acceptedConnections: 0,
      activeSockets: 0,
      kind: "socks",
      listening: false,
      name: "idle-socks",
    });
    await proxy.stop();
  });

  it("closes SOCKS5 requests without a no-auth method", async () => {
    const proxy = new SocksProxyServer({
      listen: { host: "127.0.0.1", port: 0 },
      name: "bad-method-socks",
    });
    try {
      await proxy.start();
      const socket = await connectToProxy(proxy.address.port);
      socket.write(Buffer.from([0x05, 0x01, 0x02]));
      await once(socket, "close");
      expect(socket.destroyed).toBe(true);
    } finally {
      await proxy.stop();
    }
  });
});

async function requestViaSocks5(
  proxyPort: number,
  targetPort: number,
): Promise<Uint8Array> {
  const socket = await connectToProxy(proxyPort);
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  expect(await readOnce(socket)).toEqual(Buffer.from([0x05, 0x00]));
  socket.write(
    Buffer.from([
      0x05,
      0x01,
      0x00,
      0x01,
      127,
      0,
      0,
      1,
      targetPort >> 8,
      targetPort & 0xff,
    ]),
  );
  expect(await readOnce(socket)).toEqual(
    Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]),
  );
  return writeAndCollect(socket, Buffer.from("socks5-ipv4"));
}

async function requestViaSocks4(
  proxyPort: number,
  targetPort: number,
): Promise<Uint8Array> {
  const socket = await connectToProxy(proxyPort);
  socket.write(
    Buffer.from([
      0x04,
      0x01,
      targetPort >> 8,
      targetPort & 0xff,
      127,
      0,
      0,
      1,
      0,
    ]),
  );
  expect(await readOnce(socket)).toEqual(
    Buffer.from([0x00, 0x5a, 0, 0, 0, 0, 0, 0]),
  );
  return writeAndCollect(socket, Buffer.from("socks4"));
}

async function requestViaSocks5Domain(
  proxyPort: number,
  targetPort: number,
): Promise<Uint8Array> {
  const socket = await connectToProxy(proxyPort);
  const host = Buffer.from("localhost");
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  expect(await readOnce(socket)).toEqual(Buffer.from([0x05, 0x00]));
  socket.write(
    Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, host.length]),
      host,
      Buffer.from([targetPort >> 8, targetPort & 0xff]),
    ]),
  );
  expect(await readOnce(socket)).toEqual(
    Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]),
  );
  return writeAndCollect(socket, Buffer.from("socks5-domain"));
}

async function connectToProxy(port: number): Promise<Socket> {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  return socket;
}

async function readOnce(socket: Socket): Promise<Buffer> {
  const [chunk] = await once(socket, "data");
  return Buffer.from(chunk);
}

async function writeAndCollect(
  socket: Socket,
  bytes: Buffer,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  socket.on("data", (chunk: Uint8Array) => chunks.push(chunk.slice()));
  socket.end(bytes);
  await once(socket, "end");
  socket.destroy();
  return concatByteArrays(chunks);
}
