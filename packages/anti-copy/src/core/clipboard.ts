import type { Feature, ResolvedOptions } from "./types";
import { isExcluded } from "./utils";

/**
 * Intercepts `copy` / `cut` events in the capture phase so that page-level
 * scripts cannot bypass protection via `stopPropagation`.
 *
 * In `"replace"` mode the clipboard payload is swapped for a custom notice.
 * `preventDefault()` is mandatory there — otherwise the browser overwrites
 * the payload with the actual selection after the handler returns.
 */
export function createClipboardFeature(options: ResolvedOptions): Feature {
  const doc = options.target;

  const handler = (e: Event) => {
    const event = e as ClipboardEvent;
    if (isExcluded(event.target, options.excludeSelectors)) return;

    if (options.mode === "replace" && event.clipboardData) {
      const selection = doc.defaultView?.getSelection()?.toString() ?? "";
      const text =
        typeof options.replaceText === "function"
          ? options.replaceText(selection)
          : options.replaceText;
      event.clipboardData.setData("text/plain", text);
      // Also override the HTML flavor so rich-text paste cannot leak content.
      event.clipboardData.setData("text/html", text);
    }
    event.preventDefault();
    options.onViolation?.({
      type: event.type === "cut" ? "cut" : "copy",
      originalEvent: event,
    });
  };

  return {
    attach() {
      doc.addEventListener("copy", handler, true);
      doc.addEventListener("cut", handler, true);
    },
    detach() {
      doc.removeEventListener("copy", handler, true);
      doc.removeEventListener("cut", handler, true);
    },
  };
}
