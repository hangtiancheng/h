import type { CodecConfig } from "../config/codec-config.js";
import type { NetworkEndpoint } from "../config/network-endpoint.js";

export interface BoundAddress {
  readonly address: string;
  readonly port: number;
}

export interface TcpProxyStatus {
  readonly acceptedConnections: number;
  readonly activeSockets: number;
  readonly address?: BoundAddress;
  readonly codec: CodecConfig;
  readonly kind: "tcp";
  readonly listen: NetworkEndpoint;
  readonly listening: boolean;
  readonly name: string;
  readonly upstream: NetworkEndpoint;
}

export interface SocksProxyStatus {
  readonly acceptedConnections: number;
  readonly activeSockets: number;
  readonly address?: BoundAddress;
  readonly kind: "socks";
  readonly listen: NetworkEndpoint;
  readonly listening: boolean;
  readonly name: string;
}

export type ProxyStatus = TcpProxyStatus | SocksProxyStatus;

export interface FleetStatus {
  readonly generatedAt: string;
  readonly proxies: readonly ProxyStatus[];
}
