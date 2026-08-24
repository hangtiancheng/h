#!/usr/bin/env node

import { connect } from "node:net";
import { stderr } from "node:process";

import { parseTcpClientArgs } from "./demo-options.js";

async function main(): Promise<void> {
  const { host, message, port } = parseTcpClientArgs(process.argv);
  const socket = connect(port, host);
  const chunks: Buffer[] = [];

  socket.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));

  await waitForSocketEvent(socket, "connect");
  socket.end(Buffer.from(message));
  await waitForSocketEvent(socket, "end");

  console.log(Buffer.concat(chunks).toString("utf8"));
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "unknown TCP client error";
  stderr.write(`${message}\n`);
  process.exit(1);
});

function waitForSocketEvent(
  socket: NodeJS.EventEmitter,
  event: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = (): void => {
      socket.off(event, onEvent);
      socket.off("error", onError);
    };
    const onEvent = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    socket.once(event, onEvent);
    socket.once("error", onError);
  });
}
