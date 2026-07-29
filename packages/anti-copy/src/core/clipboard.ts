import type { Feature, ResolvedOptions } from "./types";
import {
  escapeHtml,
  eventElement,
  isEditable,
  isExcluded,
  isSelectionExcluded,
} from "./utils";

/**
 * Intercepts `copy` / `cut` / `dragstart` events in the capture phase on the
 * window (the outermost capture target) so page-level scripts registered on
 * the document cannot pre-empt protection.
 *
 * In `"replace"` mode the clipboard payload is swapped for a custom notice.
 * `preventDefault()` is mandatory there — otherwise the browser overwrites
 * the payload with the actual selection after the handler returns.
 */
export function createClipboardFeature(options: ResolvedOptions): Feature {
  const doc = options.target;
  const listenTarget: EventTarget = doc.defaultView ?? doc;

  const isExempt = (event: Event): boolean => {
    const el = eventElement(event);
    // Editable controls keep native clipboard behavior, matching the
    // keyboard / contextmenu / style features.
    if (isEditable(el)) return true;
    // Prefer selection-based judgment: a selection spanning excluded and
    // protected regions must not leak through a target-only check.
    return (
      isSelectionExcluded(doc, options.excludeSelectors) ??
      isExcluded(el, options.excludeSelectors)
    );
  };

  const clipboardHandler = (e: Event) => {
    const event = e as ClipboardEvent;
    if (isExempt(event)) return;

    if (options.mode === "replace" && event.clipboardData) {
      const selection = doc.defaultView?.getSelection()?.toString() ?? "";
      const text =
        typeof options.replaceText === "function"
          ? options.replaceText(selection)
          : options.replaceText;
      event.clipboardData.setData("text/plain", text);
      // Also override the HTML flavor so rich-text paste cannot leak content.
      event.clipboardData.setData("text/html", escapeHtml(text));
    }
    event.preventDefault();
    options.onViolation?.({
      type: event.type === "cut" ? "cut" : "copy",
      originalEvent: event,
    });
  };

  // Dragging a selection or image out of the window copies it without ever
  // firing a copy event, so drag-out is blocked alongside the clipboard.
  const dragHandler = (e: Event) => {
    if (isExempt(e)) return;
    e.preventDefault();
    options.onViolation?.({ type: "drag", originalEvent: e });
  };

  return {
    attach() {
      listenTarget.addEventListener("copy", clipboardHandler, true);
      listenTarget.addEventListener("cut", clipboardHandler, true);
      listenTarget.addEventListener("dragstart", dragHandler, true);
    },
    detach() {
      listenTarget.removeEventListener("copy", clipboardHandler, true);
      listenTarget.removeEventListener("cut", clipboardHandler, true);
      listenTarget.removeEventListener("dragstart", dragHandler, true);
    },
  };
}
