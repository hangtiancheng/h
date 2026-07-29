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

  const clipboardHandler = (e: Event) => {
    const event = e as ClipboardEvent;
    const el = eventElement(event);
    // Editable controls keep native clipboard behavior, matching the
    // keyboard / contextmenu / style features.
    if (isEditable(el)) return;
    // Prefer selection-based judgment: the copy payload IS the selection,
    // and a selection spanning excluded and protected regions must not
    // leak through a target-only check.
    const exempt =
      isSelectionExcluded(doc, options.excludeSelectors) ??
      isExcluded(el, options.excludeSelectors);
    if (exempt) return;

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
  // firing a copy event. Judged by the drag TARGET only: the drag payload is
  // the dragged node, so a leftover selection inside an excluded region must
  // not exempt dragging protected content.
  const dragHandler = (e: Event) => {
    const el = eventElement(e);
    if (isEditable(el)) return;
    if (isExcluded(el, options.excludeSelectors)) return;
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
