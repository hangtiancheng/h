import { once } from "node:events";
import { connect, createServer, type Server, type Socket } from "node:net";
import { describe, expect, it } from "vitest";

import {
  ProxyFleet,
  relayTcpSockets,
  TcpProxyServer,
} from "../../src/proxy/index.js";
import { concatByteArrays } from "../../src/xcodec/index.js";

function payload(length: number): Uint8Array {
  return Uint8Array.from({ length }, (_, index) => (index * 17 + 23) & 0xff);
}

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
    server.close((error) => {
      if (error === undefined) {
        resolve();
        return;
      }
      reject(error);
    });
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

async function request(port: number, bytes: Uint8Array): Promise<Uint8Array> {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  const chunks: Uint8Array[] = [];
  socket.on("data", (chunk: Uint8Array) => chunks.push(chunk.slice()));
  socket.end(bytes);
  await once(socket, "end");
  socket.destroy();
  return concatByteArrays(chunks);
}

describe("TcpProxyServer", () => {
  it.each([
    { codec: { mode: "none", role: "incoming" }, name: "none" },
    {
      codec: { compressorLevel: 6, mode: "zlib", role: "incoming" },
      name: "zlib",
    },
    { codec: { mode: "xcodec", role: "incoming" }, name: "xcodec" },
  ] as const)(
    "relays TCP echo traffic through $name pipeline",
    async ({ codec, name }) => {
      const echo = await createEchoServer();
      const proxy = new TcpProxyServer({
        codec,
        listen: { host: "127.0.0.1", port: 0 },
        name,
        upstream: { host: "127.0.0.1", port: echo.port },
      });
      try {
        await proxy.start();
        const input =
          name === "xcodec"
            ? new Uint8Array(2048 * 4).fill(0x5a)
            : payload(64 * 1024);
        await expect(request(proxy.address.port, input)).resolves.toEqual(
          input,
        );
      } finally {
        await proxy.stop();
        await close(echo.server);
      }
    },
  );

  it("closes the local socket when upstream connect fails", async () => {
    const closedPort = await reserveClosedPort();
    const proxy = new TcpProxyServer({
      codec: { mode: "none", role: "incoming" },
      listen: { host: "127.0.0.1", port: 0 },
      name: "connect-fail",
      upstream: { host: "127.0.0.1", port: closedPort },
    });
    try {
      await proxy.start();
      const socket = connect(proxy.address.port, "127.0.0.1");
      await once(socket, "connect");
      await once(socket, "close");
      expect(socket.destroyed).toBe(true);
    } finally {
      await proxy.stop();
    }
  });

  it("manages multiple proxy servers as a fleet", async () => {
    const echo = await createEchoServer();
    const fleet = new ProxyFleet({
      proxies: [
        {
          codec: { mode: "none", role: "incoming" },
          listen: { host: "127.0.0.1", port: 0 },
          name: "fleet-proxy",
          upstream: { host: "127.0.0.1", port: echo.port },
        },
      ],
    });
    try {
      await fleet.start();
      const address = fleet.addresses().at(0);
      if (address === undefined) {
        throw new Error("expected fleet address");
      }
      await expect(request(address.port, payload(1024))).resolves.toEqual(
        payload(1024),
      );
    } finally {
      await fleet.stop();
      await close(echo.server);
    }
  });

  it("throws for address before listening and supports idempotent stop", async () => {
    const proxy = new TcpProxyServer({
      codec: { mode: "none", role: "incoming" },
      listen: { host: "127.0.0.1", port: 0 },
      name: "not-started",
      upstream: { host: "127.0.0.1", port: 1 },
    });

    expect(() => proxy.address).toThrow("not listening");
    await proxy.stop();
  });

  it("can stop an active relay", async () => {
    const accepted = new Set<Socket>();
    const server = createServer({ allowHalfOpen: true }, (socket) => {
      accepted.add(socket);
      socket.once("close", () => accepted.delete(socket));
      socket.on("data", (chunk: Uint8Array) => socket.write(chunk));
    });
    const port = await listen(server);
    const local = connect(port, "127.0.0.1");
    const upstream = connect(port, "127.0.0.1");
    try {
      await Promise.all([once(local, "connect"), once(upstream, "connect")]);
      const relay = relayTcpSockets(local, upstream, {
        mode: "none",
        role: "incoming",
      });
      relay.stop();
      await expect(relay.closed).resolves.toBeUndefined();
    } finally {
      local.destroy();
      upstream.destroy();
      for (const socket of accepted) {
        socket.destroy();
      }
      await close(server);
    }
  });
});

async function reserveClosedPort(): Promise<number> {
  const server = createServer();
  const port = await listen(server);
  await close(server);
  return port;
}
