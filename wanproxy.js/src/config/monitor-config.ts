import { z } from "zod";

import { NetworkEndpointSchema } from "./network-endpoint.js";

export const MonitorConfigSchema = z.object({
  listen: NetworkEndpointSchema,
});

export type MonitorConfig = z.infer<typeof MonitorConfigSchema>;
