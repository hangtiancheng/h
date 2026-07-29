import type { Feature, ResolvedOptions } from "./types";

/**
 * Heuristic DevTools-open detector based on the delta between the window's
 * outer and inner dimensions (docked DevTools shrink the inner viewport).
 *
 * Known limitations, by design:
 * - Undocked (separate window) DevTools are undetectable.
 * - Browser zoom or unusual window chrome can cause false positives.
 * - Disabled on coarse-pointer (touch) devices and very narrow windows.
 *
 * The callback fires once per closed→open transition; no destructive action
 * is ever taken. This is a deterrent, not a security boundary.
 */
export function createDevtoolsFeature(options: ResolvedOptions): Feature {
  const config = options.devtools;
  const view = options.target.defaultView;
  if (config === false || !view) {
    return {
      attach() {
        /** noop */
      },
      detach() {
        /** noop */
      },
    };
  }
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastOpened = false;

  const check = () => {
    if (
      view.outerWidth < 800 ||
      view.matchMedia?.("(pointer: coarse)").matches
    ) {
      return;
    }
    const opened =
      view.outerWidth - view.innerWidth > config.threshold ||
      view.outerHeight - view.innerHeight > config.threshold;
    if (opened && !lastOpened) {
      options.onViolation?.({ type: "devtools" });
    }
    lastOpened = opened;
  };

  return {
    attach() {
      if (timer !== null) return;
      timer = setInterval(check, config.intervalMs);
      view.addEventListener("resize", check);
    },
    detach() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      view.removeEventListener("resize", check);
      lastOpened = false;
    },
  };
}
