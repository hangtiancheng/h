import { once } from "node:events";
import type { Server } from "node:net";

import type { NetworkEndpoint } from "../config/network-endpoint.js";

export async function listen(
  server: Server,
  endpoint: NetworkEndpoint,
): Promise<void> {
  server.listen(endpoint.port, endpoint.host);
  await once(server, "listening");
}

export async function closeServer(server: Server): Promise<void> {
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
