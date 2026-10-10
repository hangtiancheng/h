interface Meta {
  gets: ((url: string, signal: AbortSignal) => Promise<void>)[];
  start: number;
}

interface Getter {
  p: Promise<void> | null;
  abort: ((reason?: unknown) => void) | null;
  got: boolean;
}

const cache = new Map<string, Map<number, Getter>>();

const chunksOf = (url: string): Map<number, Getter> => {
  let chunks = cache.get(url);
  if (!chunks) {
    chunks = new Map();
    cache.set(url, chunks);
  }
  return chunks;
};

let __resolve: ((value: void | PromiseLike<void>) => void) | null = null;
let __reject: ((reason?: unknown) => void) | null = null;
let __session = 0;

const clearCbs = () => {
  __resolve = null;
  __reject = null;
};

type PlaybackFn = (idx: number) => Promise<void>;

let playback: PlaybackFn = () => Promise.resolve();

function setPlayback(fn: PlaybackFn) {
  playback = fn;
}

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res, rej) => {
    const onAbort = () => {
      clearTimeout(timer);
      rej(signal.reason ?? new Error("aborted"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      res();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

async function getWithRetry(
  get: Meta["gets"][number],
  url: string,
  signal: AbortSignal,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await get(url, signal);
    } catch (err) {
      if (signal.aborted || attempt >= MAX_RETRIES) {
        throw err;
      }
      await sleep(RETRY_DELAY_MS, signal);
    }
  }
}

function fireDownload(url: string, metadata: Meta, idx: number): Getter {
  const chunks = chunksOf(url);
  const controller = new AbortController();
  const getter: Getter = {
    p: getWithRetry(metadata.gets[idx], url, controller.signal),
    abort: controller.abort.bind(controller),
    got: false,
  };
  chunks.set(idx, getter);
  return getter;
}

function markGot(url: string, idx: number) {
  const getter = chunksOf(url).get(idx);
  if (getter) {
    getter.p = null;
    getter.abort = null;
    getter.got = true;
  }
}

function interruptSession() {
  __reject?.(new Error("playback interrupted"));
  clearCbs();
}

function startPlayback(url: string, metadata: Meta): Promise<void> {
  interruptSession();
  return new Promise<void>((res, rej) => {
    __resolve = res;
    __reject = rej;
    const session = ++__session;
    const { gets } = metadata;
    const start = Math.max(0, metadata.start);
    if (start >= gets.length) {
      res();
      clearCbs();
      return;
    }

    const chunks = chunksOf(url);
    const need = gets.length - start;
    let played = 0;
    let settled = false;

    const settle = (err?: unknown) => {
      settled = true;
      if (err === undefined) {
        res();
      } else {
        rej(err);
      }
      if (session === __session) {
        clearCbs();
      }
    };

    (async () => {
      for (let idx = start; idx < gets.length; idx++) {
        if (settled || session !== __session) {
          return;
        }
        let getter = chunks.get(idx);
        if (!getter || (!getter.got && !getter.p)) {
          getter = fireDownload(url, metadata, idx);
        }
        if (!getter.got) {
          try {
            await getter.p;
          } catch (err) {
            if (session === __session && !settled) {
              chunks.delete(idx);
              settle(err);
            }
            return;
          }
          if (session !== __session || settled) {
            return;
          }
          markGot(url, idx);
        }
        playback(idx)
          .then(() => {
            played++;
            if (played === need && session === __session && !settled) {
              settle();
            }
          })
          .catch((err) => {
            if (session === __session && !settled) {
              settle(err);
            }
          });
      }
    })();
  });
}

function seekTo(
  url: string,
  metadata: Meta,
  idx: number,
): Promise<void> | void {
  const { gets } = metadata;
  if (idx < 0 || idx >= gets.length) {
    return;
  }
  const chunks = chunksOf(url);

  let nextNeeded = idx;
  while (nextNeeded < gets.length && chunks.get(nextNeeded)?.got) {
    nextNeeded++;
  }

  for (const [i, g] of chunks) {
    if (!g.got && i !== nextNeeded) {
      g.abort?.();
      chunks.delete(i);
    }
  }

  return startPlayback(url, { ...metadata, start: idx });
}

function findInflight(chunks: Map<number, Getter>): Getter | undefined {
  for (const g of chunks.values()) {
    if (g.p) {
      return g;
    }
  }
  return undefined;
}

async function preload(url: string, metadata: Meta, idx: number) {
  const { gets } = metadata;
  const chunks = chunksOf(url);
  let i = Math.max(0, idx);
  while (i < gets.length) {
    const existing = chunks.get(i);
    if (existing?.got) {
      i++;
      continue;
    }
    if (existing?.p) {
      try {
        await existing.p;
      } catch {
        return;
      }
      i++;
      continue;
    }
    const inflight = findInflight(chunks);
    if (inflight?.p) {
      try {
        await inflight.p;
      } catch {
        return;
      }
      continue;
    }
    const getter = fireDownload(url, metadata, i);
    try {
      await getter.p;
    } catch {
      chunks.delete(i);
      return;
    }
    markGot(url, i);
    i++;
  }
}

export { startPlayback, seekTo, preload, setPlayback };
export type { Meta };
