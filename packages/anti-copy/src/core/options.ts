import type { AntiCopyOptions, ResolvedOptions } from "./types";

export const DEFAULT_REPLACE_TEXT = "Copying is not allowed on this page.";

const DEFAULT_DEVTOOLS_INTERVAL_MS = 1000;
const DEFAULT_DEVTOOLS_THRESHOLD = 170;

/** Merge user options with defaults into a fully-populated config object. */
export function resolveOptions(options: AntiCopyOptions = {}): ResolvedOptions {
  return {
    mode: options.mode ?? "block",
    replaceText: options.replaceText ?? DEFAULT_REPLACE_TEXT,
    excludeSelectors: options.excludeSelectors ?? [],
    copy: options.copy ?? true,
    keyboard: options.keyboard ?? true,
    contextmenu: options.contextmenu ?? true,
    // "replace" mode needs a live selection for the copy event to substitute,
    // so selection blocking defaults off there.
    selectStyle: options.selectStyle ?? options.mode !== "replace",
    print: options.print ?? true,
    devtools:
      options.devtools === true
        ? {
            intervalMs: DEFAULT_DEVTOOLS_INTERVAL_MS,
            threshold: DEFAULT_DEVTOOLS_THRESHOLD,
          }
        : options.devtools
          ? {
              intervalMs:
                options.devtools.intervalMs ?? DEFAULT_DEVTOOLS_INTERVAL_MS,
              threshold:
                options.devtools.threshold ?? DEFAULT_DEVTOOLS_THRESHOLD,
            }
          : false,
    onViolation: options.onViolation,
    target: options.target ?? document,
  };
}
