import type { Socket } from "node:net";
import type { Transform } from "node:stream";

export interface RelayCloseController {
  readonly closed: Promise<void>;
  readonly resolve: () => void;
}

export function createRelayCloseController(
  local: Socket,
  upstream: Socket,
  transforms: readonly Transform[],
  destroy: () => void,
): RelayCloseController {
  let resolveClosed: () => void = () => undefined;
  let rejectClosed: (error: Error) => void = () => undefined;
  const closed = new Promise<void>((resolve, reject) => {
    resolveClosed = resolve;
    rejectClosed = reject;
  });

  let remaining = 2;
  const markClosed = () => {
    remaining -= 1;
    if (remaining === 0) {
      resolveClosed();
    }
  };
  const rejectOnce = (error: Error) => {
    destroy();
    rejectClosed(error);
  };

  local.once("close", markClosed);
  upstream.once("close", markClosed);
  for (const stream of [local, upstream, ...transforms]) {
    stream.once("error", rejectOnce);
  }

  return { closed, resolve: resolveClosed };
}
