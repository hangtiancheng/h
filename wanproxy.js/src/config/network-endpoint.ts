import { z } from "zod";

export const HostSchema = z.string().min(1);
export const PortSchema = z.number().int().min(0).max(65535);

export const NetworkEndpointSchema = z.object({
  host: HostSchema,
  port: PortSchema,
});

export type NetworkEndpoint = z.infer<typeof NetworkEndpointSchema>;

export function formatEndpoint(endpoint: NetworkEndpoint): string {
  return `${endpoint.host}:${endpoint.port}`;
}
