import type { Writable } from "node:stream";

import { loadWanproxyConfig } from "../config/config-file.js";
import { ProxyFleet } from "../proxy/proxy-fleet.js";
import { parseProxyCliArgs } from "./proxy-cli-args.js";

export async function startConfiguredProxy(
  argv: readonly string[] = process.argv,
  output: Writable = process.stdout,
): Promise<ProxyFleet> {
  const args = parseProxyCliArgs(argv);
  const config = await loadWanproxyConfig(args.configPath);
  const fleet = new ProxyFleet(config);
  await fleet.start();

  for (const address of fleet.addresses()) {
    output.write(`proxy listening on ${address.address}:${address.port}\n`);
  }
  const monitorAddress = fleet.monitorAddress();
  if (monitorAddress !== undefined) {
    output.write(
      `monitor listening on ${monitorAddress.address}:${monitorAddress.port}\n`,
    );
  }

  return fleet;
}

export function formatProxyCliError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown proxy CLI error";
}
