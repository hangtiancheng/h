import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Meta } from "./downloader-sdk";

type Sdk = typeof import("./downloader-sdk");

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
  reject: (err?: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (err?: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface ChunkCall {
  idx: number;
  signal: AbortSignal;
  settled: boolean;
  resolve: () => void;
  reject: (err: unknown) => void;
}

function makeTrack(n: number, url = "https://music.example/track") {
  const calls: ChunkCall[] = [];
  let maxConcurrent = 0;
  const pending = () => calls.filter((c) => !c.settled);
  const gets: Meta["gets"] = Array.from(
    { length: n },
    (_, idx) => (_url: string, signal: AbortSignal) =>
      new Promise<void>((res, rej) => {
        const call: ChunkCall = {
          idx,
          signal,
          settled: false,
          resolve: () => {
            if (!call.settled) {
              call.settled = true;
              res();
            }
          },
          reject: (err) => {
            if (!call.settled) {
              call.settled = true;
              rej(err);
            }
          },
        };
        signal.addEventListener(
          "abort",
          () => call.reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
        calls.push(call);
        maxConcurrent = Math.max(maxConcurrent, pending().length);
      }),
  );
  return {
    url,
    meta: { gets, start: 0 } as Meta,
    calls,
    pending,
    callsFor: (idx: number) => calls.filter((c) => c.idx === idx),
    get maxConcurrent() {
      return maxConcurrent;
    },
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0));

let sdk: Sdk;
let played: number[];

beforeEach(async () => {
  vi.resetModules();
  sdk = await import("./downloader-sdk");
  played = [];
  sdk.setPlayback(async (idx) => {
    played.push(idx);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("startPlayback", () => {
  it("downloads chunks strictly one at a time and plays each as soon as it lands", async () => {
    const t = makeTrack(3);
    const p = sdk.startPlayback(t.url, t.meta);

    expect(t.calls.map((c) => c.idx)).toEqual([0]);
    expect(played).toEqual([]);

    t.calls[0].resolve();
    await flush();
    expect(played).toEqual([0]);
    expect(t.calls.map((c) => c.idx)).toEqual([0, 1]);

    t.calls[1].resolve();
    await flush();
    expect(played).toEqual([0, 1]);
    expect(t.calls.map((c) => c.idx)).toEqual([0, 1, 2]);

    t.calls[2].resolve();
    await flush();
    expect(played).toEqual([0, 1, 2]);
    await expect(p).resolves.toBeUndefined();
    expect(t.maxConcurrent).toBe(1);
  });

  it("does not let a slow playback block the next chunk download", async () => {
    const gates = new Map<number, Deferred>();
    sdk.setPlayback((idx) => {
      const d = deferred();
      gates.set(idx, d);
      return d.promise;
    });

    const t = makeTrack(3);
    const p = sdk.startPlayback(t.url, t.meta);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });

    t.calls[0].resolve();
    await flush();
    // playback(0) is still pending, but chunk 1 must already be requested
    expect(gates.has(0)).toBe(true);
    expect(t.callsFor(1).length).toBe(1);

    t.calls[1].resolve();
    await flush();
    t.calls[2].resolve();
    await flush();
    expect(resolved).toBe(false);

    gates.get(0)?.resolve();
    gates.get(1)?.resolve();
    gates.get(2)?.resolve();
    await flush();
    expect(resolved).toBe(true);
    await expect(p).resolves.toBeUndefined();
  });

  it("resolves immediately when there is nothing to play", async () => {
    const empty = makeTrack(0);
    await expect(
      sdk.startPlayback(empty.url, empty.meta),
    ).resolves.toBeUndefined();

    const t = makeTrack(2, "https://music.example/other");
    await expect(
      sdk.startPlayback(t.url, { ...t.meta, start: 99 }),
    ).resolves.toBeUndefined();
    expect(t.calls.length).toBe(0);
  });

  it("clamps a negative start to 0 instead of retrying gets[-1]", async () => {
    const t = makeTrack(2);
    const p = sdk.startPlayback(t.url, { ...t.meta, start: -5 });
    expect(t.calls.map((c) => c.idx)).toEqual([0]);
    t.calls[0].resolve();
    await flush();
    t.calls[1].resolve();
    await flush();
    await expect(p).resolves.toBeUndefined();
    expect(played).toEqual([0, 1]);
  });

  it("interrupts a previous session when called again", async () => {
    const t = makeTrack(3);
    const p1 = sdk.startPlayback(t.url, t.meta);
    const err1 = p1.catch((e: Error) => e);

    const t2 = makeTrack(1, "https://music.example/second");
    const p2 = sdk.startPlayback(t2.url, t2.meta);

    expect(((await err1) as Error).message).toBe("playback interrupted");
    t2.calls[0].resolve();
    await flush();
    await expect(p2).resolves.toBeUndefined();
  });
});

describe("retry with fixed delay", () => {
  it("retries a failed chunk every 100ms and recovers", async () => {
    vi.useFakeTimers();
    const t = makeTrack(1);
    const p = sdk.startPlayback(t.url, t.meta);

    t.calls[0].reject(new Error("flaky"));
    await vi.advanceTimersByTimeAsync(99);
    expect(t.calls.length).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls.length).toBe(2);

    t.calls[1].reject(new Error("flaky"));
    await vi.advanceTimersByTimeAsync(99);
    expect(t.calls.length).toBe(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls.length).toBe(3);

    t.calls[2].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(played).toEqual([0]);
    await expect(p).resolves.toBeUndefined();
  });

  it("gives up after 3 retries (4 attempts) and rejects the session", async () => {
    vi.useFakeTimers();
    const t = makeTrack(1);
    const p = sdk.startPlayback(t.url, t.meta);
    const captured = p.catch((e: unknown) => e);
    const boom = new Error("net down");

    for (let attempt = 0; attempt < 4; attempt++) {
      expect(t.calls.length).toBe(attempt + 1);
      t.calls[attempt].reject(boom);
      await vi.advanceTimersByTimeAsync(101);
    }
    expect(t.calls.length).toBe(4);
    expect(await captured).toBe(boom);
  });

  it("a seek during the retry delay aborts the retry loop for good", async () => {
    vi.useFakeTimers();
    const t = makeTrack(3);
    const p1 = sdk.startPlayback(t.url, t.meta);
    const err1 = p1.catch((e: Error) => e);

    t.calls[0].reject(new Error("flaky"));
    await vi.advanceTimersByTimeAsync(0); // now sleeping before retry

    const p2 = sdk.seekTo(t.url, t.meta, 2) as Promise<void>;
    expect(t.callsFor(2).length).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.callsFor(0).length).toBe(1); // retry never re-fired after abort
    expect(((await err1) as Error).message).toBe("playback interrupted");

    t.callsFor(2)[0].resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(played).toEqual([2]);
    await expect(p2).resolves.toBeUndefined();
  });
});

describe("seekTo", () => {
  async function playUpTo(t: ReturnType<typeof makeTrack>, lastIdx: number) {
    for (let i = 0; i <= lastIdx; i++) {
      t.callsFor(i).at(-1)?.resolve();
      await flush();
    }
  }

  it("backward seek to a got chunk replays instantly and keeps the inflight request", async () => {
    const t = makeTrack(15);
    const p1 = sdk.startPlayback(t.url, t.meta);
    const err1 = p1.catch((e: Error) => e);
    await playUpTo(t, 6); // chunks 0-6 got, chunk 7 inflight
    expect(played).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(t.pending().map((c) => c.idx)).toEqual([7]);

    const totalCallsBefore = t.calls.length;
    void sdk.seekTo(t.url, t.meta, 2);

    // got chunks replay synchronously, no chunk is re-downloaded
    expect(played).toEqual([0, 1, 2, 3, 4, 5, 6, 2, 3, 4, 5, 6]);
    expect(t.calls.length).toBe(totalCallsBefore);
    expect(t.callsFor(7)[0].signal.aborted).toBe(false);
    expect(((await err1) as Error).message).toBe("playback interrupted");

    // the inflight chunk is reused by the new session
    t.callsFor(7)[0].resolve();
    await flush();
    expect(played.at(-1)).toBe(7);
    expect(t.callsFor(7).length).toBe(1);
    expect(t.callsFor(8).length).toBe(1);
    expect(t.maxConcurrent).toBe(1);
  });

  it("fast-forward into an unfetched region aborts the inflight chunk and requests the target immediately", async () => {
    const t = makeTrack(15);
    const p1 = sdk.startPlayback(t.url, t.meta);
    void p1.catch(() => {
      /** noop */
    });
    await playUpTo(t, 6); // chunk 7 inflight

    void sdk.seekTo(t.url, t.meta, 10);

    expect(t.callsFor(7)[0].signal.aborted).toBe(true);
    expect(t.callsFor(10).length).toBe(1);
    expect(t.pending().map((c) => c.idx)).toEqual([10]);

    t.callsFor(10)[0].resolve();
    await flush();
    expect(played.at(-1)).toBe(10);
    expect(t.maxConcurrent).toBe(1);
  });

  it("sparse cache: backward seek plays instantly, aborts the far inflight chunk, and fills the gap next", async () => {
    const t = makeTrack(15);
    const p1 = sdk.startPlayback(t.url, t.meta);
    void p1.catch(() => {
      /** noop */
    });
    await playUpTo(t, 6); // 0-6 got, 7 inflight

    const p2 = sdk.seekTo(t.url, t.meta, 10) as Promise<void>;
    void p2.catch(() => {
      /** noop */
    });
    t.callsFor(10)[0].resolve();
    await flush();
    t.callsFor(11)[0].resolve();
    await flush();
    // state: got = 0-6, 10, 11; chunk 12 inflight; 7, 8, 9 missing (sparse)
    expect(played.slice(-2)).toEqual([10, 11]);
    expect(t.pending().map((c) => c.idx)).toEqual([12]);

    const p3 = sdk.seekTo(t.url, t.meta, 6) as Promise<void>;

    // chunk 6 plays immediately, chunk 12's request is aborted,
    // and the gap chunk 7 is requested immediately
    expect(played.at(-1)).toBe(6);
    expect(t.callsFor(12)[0].signal.aborted).toBe(true);
    expect(t.callsFor(7).length).toBe(2); // first one was aborted by the seek to 10
    expect(t.pending().map((c) => c.idx)).toEqual([7]);

    // fill the gap: 7, 8, 9 download; 10, 11 replay from cache; 12 re-downloads
    t.callsFor(7)[1].resolve();
    await flush();
    t.callsFor(8)[0].resolve();
    await flush();
    t.callsFor(9)[0].resolve();
    await flush();
    expect(played.slice(-5)).toEqual([7, 8, 9, 10, 11]);
    expect(t.callsFor(10).length).toBe(1); // got chunks are never re-downloaded
    expect(t.callsFor(11).length).toBe(1);
    expect(t.callsFor(12).length).toBe(2);

    t.callsFor(12)[1].resolve();
    await flush();
    t.callsFor(13)[0].resolve();
    await flush();
    t.callsFor(14)[0].resolve();
    await flush();
    await expect(p3).resolves.toBeUndefined();
    expect(played.slice(-9)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14]);
    expect(t.maxConcurrent).toBe(1);
  });

  it("seeking to the chunk currently downloading reuses its request", async () => {
    const t = makeTrack(3);
    const p1 = sdk.startPlayback(t.url, t.meta);
    void p1.catch(() => {
      /** noop */
    });
    await playUpTo(t, 0); // chunk 1 inflight

    const p2 = sdk.seekTo(t.url, t.meta, 1) as Promise<void>;
    expect(t.callsFor(1).length).toBe(1);
    expect(t.callsFor(1)[0].signal.aborted).toBe(false);

    t.callsFor(1)[0].resolve();
    await flush();
    expect(played.at(-1)).toBe(1);
    t.callsFor(2)[0].resolve();
    await flush();
    await expect(p2).resolves.toBeUndefined();
  });

  it("repeated seeks to the same inflight target do not duplicate requests", async () => {
    const t = makeTrack(5);
    const s1 = sdk.seekTo(t.url, t.meta, 3) as Promise<void>;
    void s1.catch(() => {
      /** noop */
    });
    const s2 = sdk.seekTo(t.url, t.meta, 3) as Promise<void>;
    void s2.catch(() => {
      /** noop */
    });
    const s3 = sdk.seekTo(t.url, t.meta, 3) as Promise<void>;
    void s3.catch(() => {
      /** noop */
    });

    expect(t.callsFor(3).length).toBe(1);
    expect(t.pending().map((c) => c.idx)).toEqual([3]);
    expect(t.maxConcurrent).toBe(1);
  });

  it("rapid alternating seeks keep at most one inflight request and settle only the last session", async () => {
    const t = makeTrack(10);
    const p0 = sdk.startPlayback(t.url, t.meta);
    const s1 = sdk.seekTo(t.url, t.meta, 5) as Promise<void>;
    const s2 = sdk.seekTo(t.url, t.meta, 1) as Promise<void>;
    const s3 = sdk.seekTo(t.url, t.meta, 7) as Promise<void>;

    await expect(p0).rejects.toThrow("playback interrupted");
    await expect(s1).rejects.toThrow("playback interrupted");
    await expect(s2).rejects.toThrow("playback interrupted");

    expect(t.callsFor(0)[0].signal.aborted).toBe(true);
    expect(t.callsFor(5)[0].signal.aborted).toBe(true);
    expect(t.callsFor(1)[0].signal.aborted).toBe(true);
    expect(t.pending().map((c) => c.idx)).toEqual([7]);

    t.callsFor(7)[0].resolve();
    await flush();
    t.callsFor(8)[0].resolve();
    await flush();
    t.callsFor(9)[0].resolve();
    await flush();
    await expect(s3).resolves.toBeUndefined();
    expect(played).toEqual([7, 8, 9]);
    expect(t.maxConcurrent).toBe(1);
  });

  it("out-of-range seeks are no-ops", async () => {
    const t = makeTrack(3);
    const p = sdk.startPlayback(t.url, t.meta);

    expect(sdk.seekTo(t.url, t.meta, 99)).toBeUndefined();
    expect(sdk.seekTo(t.url, t.meta, -1)).toBeUndefined();
    expect(t.callsFor(0)[0].signal.aborted).toBe(false);

    t.calls[0].resolve();
    await flush();
    t.calls[1].resolve();
    await flush();
    t.calls[2].resolve();
    await flush();
    await expect(p).resolves.toBeUndefined();
  });
});

describe("preload", () => {
  it("downloads sequentially and a later playback reuses the cache without re-downloading", async () => {
    const t = makeTrack(3);
    const pre = sdk.preload(t.url, t.meta, 0);

    expect(t.calls.map((c) => c.idx)).toEqual([0]);
    t.calls[0].resolve();
    await flush();
    t.calls[1].resolve();
    await flush();
    t.calls[2].resolve();
    await pre;
    expect(t.calls.length).toBe(3);
    expect(t.maxConcurrent).toBe(1);

    const p = sdk.startPlayback(t.url, t.meta);
    expect(t.calls.length).toBe(3); // no new requests
    expect(played).toEqual([0, 1, 2]); // instant playback from cache
    await expect(p).resolves.toBeUndefined();
  });

  it("defers to an active playback download: never two inflight chunks for one url", async () => {
    const t = makeTrack(4);
    const p = sdk.startPlayback(t.url, t.meta);
    const pre = sdk.preload(t.url, t.meta, 2);

    // preload must not fire while playback's chunk 0 is inflight
    expect(t.calls.map((c) => c.idx)).toEqual([0]);

    t.calls[0].resolve();
    await flush();
    expect(t.pending().length).toBe(1);
    t.pending()[0].resolve();
    await flush();
    expect(t.pending().length).toBe(1);
    t.pending()[0].resolve();
    await flush();
    t.pending()[0]?.resolve();
    await flush();

    await expect(p).resolves.toBeUndefined();
    await pre;
    expect(t.maxConcurrent).toBe(1);
    // every chunk downloaded exactly once despite the overlap
    for (let i = 0; i < 4; i++) {
      expect(t.callsFor(i).length).toBe(1);
    }
  });

  it("backs off when a seek aborts the download it is waiting on", async () => {
    const t = makeTrack(6);
    const p1 = sdk.startPlayback(t.url, t.meta);
    void p1.catch(() => {
      /** noop */
    });
    const pre = sdk.preload(t.url, t.meta, 4);
    expect(t.calls.map((c) => c.idx)).toEqual([0]);

    const p2 = sdk.seekTo(t.url, t.meta, 3) as Promise<void>;
    await pre; // preload returns instead of racing the new session

    expect(t.callsFor(4).length).toBe(0);
    expect(t.pending().map((c) => c.idx)).toEqual([3]);

    t.callsFor(3)[0].resolve();
    await flush();
    t.callsFor(4)[0].resolve();
    await flush();
    t.callsFor(5)[0].resolve();
    await flush();
    await expect(p2).resolves.toBeUndefined();
    expect(t.maxConcurrent).toBe(1);
  });

  it("preloading another url does not disturb the current playback state", async () => {
    const a = makeTrack(2, "https://music.example/a");
    const b = makeTrack(2, "https://music.example/b");

    const pa = sdk.startPlayback(a.url, a.meta);
    const pre = sdk.preload(b.url, b.meta, 0);

    // caches are independent per url
    expect(a.calls.map((c) => c.idx)).toEqual([0]);
    expect(b.calls.map((c) => c.idx)).toEqual([0]);

    a.calls[0].resolve();
    await flush();
    a.calls[1].resolve();
    await flush();
    await expect(pa).resolves.toBeUndefined();
    expect(played).toEqual([0, 1]);

    b.calls[0].resolve();
    await flush();
    b.calls[1].resolve();
    await pre;

    // playing b now needs no downloads at all
    played.length = 0;
    const pb = sdk.startPlayback(b.url, b.meta);
    expect(b.calls.length).toBe(2);
    expect(played).toEqual([0, 1]);
    await expect(pb).resolves.toBeUndefined();
  });

  it("out-of-range preload does nothing", async () => {
    const t = makeTrack(3);
    await sdk.preload(t.url, t.meta, 99);
    expect(t.calls.length).toBe(0);
  });
});

describe("playback failures", () => {
  it("a playback error rejects the session and stops further downloads", async () => {
    const boom = new Error("decoder blew up");
    sdk.setPlayback((idx) =>
      idx === 0 ? Promise.reject(boom) : Promise.resolve(),
    );

    const t = makeTrack(3);
    const p = sdk.startPlayback(t.url, t.meta);
    const captured = p.catch((e: unknown) => e);

    t.calls[0].resolve();
    await flush();
    expect(await captured).toBe(boom);

    // chunk 1 was already fired before the error landed; once it settles,
    // the dead session must not request chunk 2
    t.callsFor(1)[0]?.resolve();
    await flush();
    expect(t.callsFor(2).length).toBe(0);
  });
});
