import { once } from "node:events";
import { connect, createServer, type Server, type Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { MonitorServer } from "../../src/monitor/index.js";
import { ProxyFleet } from "../../src/proxy/index.js";

const FleetStatusSchema = z.object({
  generatedAt: z.string(),
  proxies: z.array(
    z.object({
      acceptedConnections: z.number().int().nonnegative(),
      activeSockets: z.number().int().nonnegative(),
      kind: z.enum(["tcp", "socks"]),
      listening: z.boolean(),
      name: z.string(),
    }),
  ),
});

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

describe("MonitorServer", () => {
  it("rejects address reads before start and returns JSON 404s", async () => {
    const monitor = new MonitorServer(
      { listen: { host: "127.0.0.1", port: 0 } },
      () => ({
        generatedAt: new Date(0).toISOString(),
        proxies: [],
      }),
    );

    expect(() => monitor.address).toThrow("not listening");
    try {
      await monitor.start();
      const response = await fetch(
        `http://127.0.0.1:${monitor.address.port}/missing`,
      );
      const parsed: unknown = JSON.parse(await response.text());
      expect(response.status).toBe(404);
      expect(parsed).toEqual({ error: "not found" });
    } finally {
      await monitor.stop();
    }
  });

  it("serves proxy fleet status as JSON and stops cleanly", async () => {
    const accepted = new Set<Socket>();
    const echo = createServer({ allowHalfOpen: true }, (socket) => {
      accepted.add(socket);
      socket.once("close", () => accepted.delete(socket));
      socket.on("data", (chunk: Uint8Array) => socket.write(chunk));
      socket.on("end", () => socket.end());
    });
    const echoPort = await listen(echo);
    const fleet = new ProxyFleet({
      monitor: { listen: { host: "127.0.0.1", port: 0 } },
      proxies: [
        {
          codec: { mode: "none", role: "incoming" },
          listen: { host: "127.0.0.1", port: 0 },
          name: "monitored-tcp",
          upstream: { host: "127.0.0.1", port: echoPort },
        },
      ],
    });

    try {
      await fleet.start();
      const proxyAddress = fleet.addresses().at(0);
      const monitorAddress = fleet.monitorAddress();
      if (proxyAddress === undefined || monitorAddress === undefined) {
        throw new Error("expected proxy and monitor addresses");
      }
      await sendEcho(proxyAddress.port);
      const status = await fetchStatus(monitorAddress.port);
      const firstProxy = status.proxies.at(0);
      expect(firstProxy).toMatchObject({
        acceptedConnections: 1,
        kind: "tcp",
        listening: true,
        name: "monitored-tcp",
      });
    } finally {
      await fleet.stop();
      for (const socket of accepted) {
        socket.destroy();
      }
      await close(echo);
    }
  });
});

async function sendEcho(port: number): Promise<void> {
  const socket = connect(port, "127.0.0.1");
  await once(socket, "connect");
  const chunks: Uint8Array[] = [];
  socket.on("data", (chunk: Uint8Array) => chunks.push(chunk.slice()));
  socket.end(Buffer.from("monitor"));
  await once(socket, "end");
  socket.destroy();
  expect(Buffer.concat(chunks)).toEqual(Buffer.from("monitor"));
}

async function fetchStatus(
  port: number,
): Promise<z.infer<typeof FleetStatusSchema>> {
  const response = await fetch(`http://127.0.0.1:${port}/status`);
  const parsed: unknown = JSON.parse(await response.text());
  return FleetStatusSchema.parse(parsed);
}
