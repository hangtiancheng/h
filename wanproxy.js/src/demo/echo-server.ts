#!/usr/bin/env node

import { createServer } from "node:net";

import { parseEchoServerArgs } from "./demo-options.js";

const { host, port } = parseEchoServerArgs(process.argv);

const server = createServer({ allowHalfOpen: true }, (socket) => {
  socket.on("data", (chunk: Buffer) => socket.write(chunk));
  socket.on("end", () => socket.end());
});

server.listen(port, host, () => {
  console.log(`echo server listening on ${host}:${port}`);
});

const shutdownSignals: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM"];

for (const signal of shutdownSignals) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
  });
}
