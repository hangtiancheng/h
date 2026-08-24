import type { WanproxyConfig } from "../config/proxy-config.js";
import { MonitorServer } from "../monitor/monitor-server.js";
import type { BoundAddress, FleetStatus, ProxyStatus } from "./proxy-status.js";
import { SocksProxyServer } from "./socks-proxy.js";
import { TcpProxyServer } from "./tcp-proxy.js";

export class ProxyFleet {
  private readonly monitor: MonitorServer | undefined;
  private readonly servers: readonly FleetServer[];

  public constructor(config: WanproxyConfig) {
    this.servers = [
      ...(config.proxies ?? []).map((proxy) => new TcpProxyServer(proxy)),
      ...(config.socksProxies ?? []).map(
        (proxy) => new SocksProxyServer(proxy),
      ),
    ];
    this.monitor =
      config.monitor === undefined
        ? undefined
        : new MonitorServer(config.monitor, () => this.status());
  }

  public async start(): Promise<void> {
    await Promise.all(this.servers.map((server) => server.start()));
    await this.monitor?.start();
  }

  public async stop(): Promise<void> {
    await this.monitor?.stop();
    await Promise.all(this.servers.map((server) => server.stop()));
  }

  public addresses(): readonly {
    readonly address: string;
    readonly port: number;
  }[] {
    return this.servers.map((server) => server.address);
  }

  public monitorAddress(): BoundAddress | undefined {
    return this.monitor?.address;
  }

  public status(): FleetStatus {
    return {
      generatedAt: new Date().toISOString(),
      proxies: this.servers.map((server): ProxyStatus => server.status()),
    };
  }
}

type FleetServer = TcpProxyServer | SocksProxyServer;
