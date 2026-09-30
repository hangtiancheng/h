/**
 * # Music Player SDK Design and Implementation
 *
 * ## Background
 * We are developing a music player SDK that requires the following core features:
 *
 * 1. **Playback Functionality**: The `startPlayback` method accepts a URL and other
 *    required metadata to start chunked downloading and playback of the music file.
 *    To ensure a good user experience, playback should start as quickly as possible,
 *    and each downloaded chunk should be parsed and played as soon as it is available.
 *
 * 2. **Seek Functionality**: The `seekTo` method allows jumping to a specified position
 *    in the currently playing music, ensuring the correct chunk is downloaded and
 *    played.
 *
 * 3. **Preloading Functionality**: The `preload` method supports downloading chunks of
 *    a specified URL for faster startup during playback.
 *
 * ## Special Requirements
 * 1. **Chunked Downloading Strategy**: All music files must be downloaded in chunks.
 *    Only one chunk can be downloaded at a time, and playback can only start after the
 *    first chunk is fully downloaded.
 *
 * ## Requirements
 * Based on the above needs, please complete the following tasks:
 *
 * 1. **API Design**
 *    - Design the SDK interface and implement core logics on download.
 */

interface Meta {
  gets: ((url: string, signal: AbortSignal) => Promise<void>)[];
  start: number;
}

interface Getter {
  p: Promise<void> | null;
  abort: ((reason?: unknown) => void) | null;
  got: boolean;
}

// Chunk cache keyed by url, then by absolute chunk index, so preloading one
// url never corrupts the download state of another.
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
// Incremented whenever a new playback session starts; stale download loops
// compare against it and bail out instead of racing the new session.
let __session = 0;

const clearCbs = () => {
  __resolve = null;
  __reject = null;
};

type PlaybackFn = (idx: number) => Promise<void>;

// Injected by the host player; defaults to a no-op so the SDK is inert
// until wired up.
let playback: PlaybackFn = () => Promise.resolve();

function setPlayback(fn: PlaybackFn) {
  playback = fn;
}

// Fixed short retry delay (no exponential backoff): a stalled playback chunk
// is latency-critical, so fail fast and let the caller degrade instead of
// waiting out long backoffs.
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
      // Aborted downloads (e.g. by a seek) must not be retried.
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
  // Starting a new playback replaces (and interrupts) any previous session.
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
      // Chunks are downloaded strictly one at a time, but playback of each
      // chunk is fired as soon as it lands and never blocks the next download.
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
            // Only the live session may clean up and settle; a stale session
            // (replaced by a seek) must not touch shared cache entries.
            if (session === __session && !settled) {
              chunks.delete(idx);
              settle(err);
            }
            return;
          }
          if (session !== __session || settled) {
            // A seek replaced this session while we were downloading.
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

  // Got chunks may be sparse (earlier seeks/preloads), so scan for the first
  // chunk at or after idx that still needs downloading.
  let nextNeeded = idx;
  while (nextNeeded < gets.length && chunks.get(nextNeeded)?.got) {
    nextNeeded++;
  }

  // Keep an inflight request only if it is exactly the next chunk we need
  // (the new session reuses its promise); any other inflight download would
  // block it (one chunk at a time) and is aborted so nextNeeded can start
  // immediately.
  for (const [i, g] of chunks) {
    if (!g.got && i !== nextNeeded) {
      g.abort?.();
      // Drop the aborted entry so a later session re-downloads this chunk.
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
      // Someone else (playback or an earlier preload) is downloading it.
      try {
        await existing.p;
      } catch {
        // Aborted by a seek or failed after retries: stop preloading rather
        // than racing the new session.
        return;
      }
      i++;
      continue;
    }
    // Only one chunk may download at a time per url: defer to any other
    // inflight download (e.g. an active playback session), then re-check
    // this index since the state may have changed while waiting.
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
