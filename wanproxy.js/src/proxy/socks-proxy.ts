import { connect, createServer, type Server, type Socket } from "node:net";

import type { SocksProxyConfig } from "../config/proxy-config.js";
import type { SocksProxyStatus } from "./proxy-status.js";
import { closeServer, listen } from "./socket-utils.js";
import {
  createSocksSuccessResponse,
  readSocksConnectRequest,
} from "./socks-request.js";
import { relayTcpSockets } from "./tcp-relay.js";

export class SocksProxyServer {
  private acceptedConnections = 0;
  private readonly connections = new Set<Socket>();
  private readonly server: Server;

  public constructor(private readonly config: SocksProxyConfig) {
    this.server = createServer({ allowHalfOpen: true }, (socket) => {
      void this.accept(socket);
    });
  }

  public get address(): { readonly address: string; readonly port: number } {
    const address = this.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("SOCKS proxy server is not listening on a TCP address");
    }
    return { address: address.address, port: address.port };
  }

  public async start(): Promise<void> {
    await listen(this.server, this.config.listen);
  }

  public async stop(): Promise<void> {
    for (const socket of this.connections) {
      socket.destroy();
    }
    await closeServer(this.server);
  }

  public status(): SocksProxyStatus {
    const address = this.tryAddress();
    return address === undefined
      ? this.baseStatus()
      : { ...this.baseStatus(), address };
  }

  private async accept(client: Socket): Promise<void> {
    this.acceptedConnections += 1;
    this.track(client);
    try {
      const request = await readSocksConnectRequest(client);
      const upstream = connect({
        allowHalfOpen: true,
        host: request.host,
        port: request.port,
      });
      this.track(upstream);
      upstream.once("connect", () => {
        client.write(createSocksSuccessResponse(request));
        request.releaseBufferedData();
        const relay = relayTcpSockets(client, upstream, {
          mode: "none",
          role: "incoming",
        });
        relay.closed
          .catch(() => undefined)
          .finally(() => this.connections.delete(upstream));
      });
      upstream.once("error", () => client.destroy());
    } catch {
      client.destroy();
    }
  }

  private track(socket: Socket): void {
    this.connections.add(socket);
    socket.once("close", () => this.connections.delete(socket));
  }

  private baseStatus(): Omit<SocksProxyStatus, "address"> {
    return {
      acceptedConnections: this.acceptedConnections,
      activeSockets: this.connections.size,
      kind: "socks",
      listen: this.config.listen,
      listening: this.server.listening,
      name: this.config.name,
    };
  }

  private tryAddress():
    { readonly address: string; readonly port: number } | undefined {
    const address = this.server.address();
    if (address === null || typeof address === "string") {
      return undefined;
    }
    return { address: address.address, port: address.port };
  }
}
