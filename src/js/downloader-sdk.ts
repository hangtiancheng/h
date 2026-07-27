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
  abort: ((reason?: any) => void) | null;
  got: boolean;
}

const getters = new Map<number, Getter>();

let __resolve: ((value: void | PromiseLike<void>) => void) | null = null;
let __reject: ((reason?: any) => void) | null = null;

const clearCbs = () => {
  __resolve = null;
  __reject = null;
};

declare function playback(idx: number): Promise<void>;

function startPlayback(url: string, metadata: Meta) {
  return new Promise<void>(async (res, rej) => {
    __resolve = res;
    __reject = rej;
    const { gets, start } = metadata;
    if (start >= gets.length) {
      res();
      clearCbs();
      return;
    }
    const need = gets.length - start;
    let resolved = 0;
    for (const [idx, get] of gets.slice(start).entries()) {
      const controller = new AbortController();
      const p = get(url, controller.signal);
      getters.set(idx, {
        p,
        abort: controller.abort.bind(controller),
        got: false,
      });

      try {
        await p;
      } catch (err) {
        rej(err);
        clearCbs();
      }
      resolved++;
      const getter = getters.get(idx);
      if (getter) {
        // Maybe redundant
        getter.p = null;
        getter.abort = null;
        getter.got = true;
      }
      playback(idx)
        .then(() => {
          resolved++;
          if (resolved === need) {
            res();
            clearCbs();
          }
        })
        .catch(rej);
    }
  });
}

function clearFiring(getters: Getter[]) {
  for (const g of getters.values()) {
    const { abort, got } = g;
    if (!got) {
      abort?.();
    }
  }
  __reject?.();
  clearCbs();
}

function seekTo(url: string, metadata: Meta, idx: number) {
  const { gets } = metadata;
  if (idx >= gets.length) {
    return;
  }
  const get = getters.get(idx);
  // Haven't fired
  if (!get) {
    clearFiring(Array.from(getters.values()));
    startPlayback(url, {
      ...metadata,
      start: idx,
    });
  }

  // Fired or firing
  if (get) {
    const { p, abort, got } = get;
    if (got) {
      // Already got
      clearFiring(Array.from(getters.values()));
      startPlayback(url, {
        ...metadata,
        start: idx,
      });
      return;
    }
    // Firing: do nothing
  }
}

async function preload(url: string, metadata: Meta, idx: number) {
  const { gets } = metadata;
  if (idx >= gets.length) {
    return;
  }

  for (const get of gets.slice(idx)) {
    const controller = new AbortController();
    const p = get(url, controller.signal);
    getters.set(idx, {
      p,
      abort: controller.abort.bind(controller),
      got: false,
    });
    await p;
    const getter = getters.get(idx);
    if (getter) {
      getter.p = null;
      getter.abort = null;
      getter.got = true;
    }
  }
}
