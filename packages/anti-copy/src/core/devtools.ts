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
  const win = options.target.defaultView;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastOpened = false;

  const check = () => {
    if (!win || config === false) return;
    if (win.outerWidth < 800 || win.matchMedia?.("(pointer: coarse)").matches) {
      return;
    }
    const opened =
      win.outerWidth - win.innerWidth > config.threshold ||
      win.outerHeight - win.innerHeight > config.threshold;
    if (opened && !lastOpened) {
      options.onViolation?.({ type: "devtools" });
    }
    lastOpened = opened;
  };

  return {
    attach() {
      if (!win || config === false || timer !== null) return;
      timer = setInterval(check, config.intervalMs);
      win.addEventListener("resize", check);
    },
    detach() {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      win?.removeEventListener("resize", check);
      lastOpened = false;
    },
  };
}
