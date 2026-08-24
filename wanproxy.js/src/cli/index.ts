#!/usr/bin/env node

import { stderr } from "node:process";

import { formatProxyCliError, startConfiguredProxy } from "./proxy-cli.js";

async function main(): Promise<void> {
  const fleet = await startConfiguredProxy();

  const stop = async (): Promise<void> => {
    await fleet.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void stop();
  });
  process.once("SIGTERM", () => {
    void stop();
  });
}

main().catch((error: unknown) => {
  stderr.write(`${formatProxyCliError(error)}\n`);
  process.exit(1);
});
