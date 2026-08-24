import { z } from "zod";

import { CodecConfigSchema } from "./codec-config.js";
import { MonitorConfigSchema } from "./monitor-config.js";
import { NetworkEndpointSchema } from "./network-endpoint.js";

export const TcpProxyConfigSchema = z.object({
  codec: CodecConfigSchema.default({ mode: "none", role: "incoming" }),
  listen: NetworkEndpointSchema,
  name: z.string().min(1),
  upstream: NetworkEndpointSchema,
});

export const SocksProxyConfigSchema = z.object({
  listen: NetworkEndpointSchema,
  name: z.string().min(1),
});

export const WanproxyConfigSchema = z
  .object({
    monitor: MonitorConfigSchema.optional(),
    proxies: z.array(TcpProxyConfigSchema).optional(),
    socksProxies: z.array(SocksProxyConfigSchema).optional(),
  })
  .refine(
    (config) =>
      (config.proxies?.length ?? 0) + (config.socksProxies?.length ?? 0) > 0,
    {
      message: "at least one proxy or SOCKS proxy is required",
    },
  );

export type SocksProxyConfig = z.infer<typeof SocksProxyConfigSchema>;
export type TcpProxyConfig = z.infer<typeof TcpProxyConfigSchema>;
export type WanproxyConfig = z.infer<typeof WanproxyConfigSchema>;

export function parseWanproxyConfig(input: unknown): WanproxyConfig {
  return WanproxyConfigSchema.parse(input);
}
