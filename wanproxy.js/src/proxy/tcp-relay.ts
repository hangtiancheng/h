import type { Socket } from "node:net";
import type { Transform } from "node:stream";

import type { CodecConfig } from "../config/codec-config.js";
import type { PipelineRuntimeDeps } from "../pipeline/pipeline-builder.js";
import { buildCodecPipeline } from "../pipeline/pipeline-builder.js";
import { proxyPipelineOptions } from "./pipeline-options.js";
import { createRelayCloseController } from "./relay-close.js";
import type { RelayResult } from "./relay-result.js";

export function relayTcpSockets(
  local: Socket,
  upstream: Socket,
  codec: CodecConfig,
  deps: PipelineRuntimeDeps = {},
): RelayResult {
  const send = buildCodecPipeline(
    proxyPipelineOptions(codec, "send"),
    deps,
  ).transforms;
  const receive = buildCodecPipeline(
    proxyPipelineOptions(codec, "receive"),
    deps,
  ).transforms;
  const streams = [...send, ...receive];
  const destroy = () => destroyAll(local, upstream, streams);
  const close = createRelayCloseController(local, upstream, streams, destroy);

  pipeChain(local, send, upstream);
  pipeChain(upstream, receive, local);

  return {
    closed: close.closed,
    stop: () => {
      destroy();
      close.resolve();
    },
  };
}

function pipeChain(
  source: Socket,
  transforms: readonly Transform[],
  destination: Socket,
): void {
  let current: NodeJS.ReadableStream = source;
  for (const transform of transforms) {
    current = current.pipe(transform);
  }
  current.pipe(destination, { end: false });
  current.once("end", () => destination.end());
}

function destroyAll(
  local: Socket,
  upstream: Socket,
  transforms: readonly Transform[],
): void {
  local.destroy();
  upstream.destroy();
  for (const transform of transforms) {
    transform.destroy();
  }
}
