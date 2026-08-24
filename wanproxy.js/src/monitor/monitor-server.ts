import { createServer, type Server } from "node:http";

import type { MonitorConfig } from "../config/monitor-config.js";
import type { BoundAddress } from "../proxy/proxy-status.js";
import { closeServer } from "../proxy/socket-utils.js";
import type { MonitorStatusProvider } from "./monitor-status.js";

export class MonitorServer {
  private readonly server: Server;

  public constructor(
    private readonly config: MonitorConfig,
    private readonly statusProvider: MonitorStatusProvider,
  ) {
    this.server = createServer((request, response) => {
      if (request.method !== "GET" || request.url !== "/status") {
        response.writeHead(404, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "not found" }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(this.statusProvider()));
    });
  }

  public get address(): BoundAddress {
    const address = this.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("monitor server is not listening on a TCP address");
    }
    return { address: address.address, port: address.port };
  }

  public async start(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.listen(
        this.config.listen.port,
        this.config.listen.host,
        resolve,
      );
    });
  }

  public async stop(): Promise<void> {
    await closeServer(this.server);
  }
}
