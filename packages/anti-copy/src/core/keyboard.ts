import type { Feature, ResolvedOptions } from "./types";
import { eventElement, isEditable, isExcluded } from "./utils";

const COPY_KEYS = new Set(["c", "x", "a"]);
// Ctrl/Cmd+S (save page) and Ctrl/Cmd+P (print) leak the full document.
const EXPORT_KEYS = new Set(["s", "p"]);

/**
 * Resolves the physical key, layout-independent. `e.key` varies with the
 * active keyboard layout (Cyrillic, Greek, …) and macOS Option dead keys,
 * which would let shortcuts through; `e.code` names the physical key.
 * Falls back to `e.key` for synthetic events without a `code`.
 */
function physicalKey(e: KeyboardEvent): string {
  if (e.code && e.code.startsWith("Key") && e.code.length === 4) {
    return e.code.slice(3).toLowerCase();
  }
  return e.key.toLowerCase();
}

/** Returns a shortcut description like "Ctrl+Shift+I" when the combo targets DevTools. */
function devtoolsShortcut(e: KeyboardEvent): string | null {
  if (e.key === "F12" || e.code === "F12") return "F12";
  const key = physicalKey(e);
  // Windows/Linux: Ctrl+Shift+I/J/C — macOS: Cmd+Opt+I/J/C
  if (
    (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) ||
    (e.metaKey && e.altKey && ["i", "j", "c"].includes(key))
  ) {
    return `${e.metaKey ? "Cmd+Opt" : "Ctrl+Shift"}+${key.toUpperCase()}`;
  }
  // View-source: Ctrl+U on Windows/Linux, Cmd+Opt+U on macOS.
  if (key === "u" && !e.shiftKey) {
    if (e.ctrlKey && !e.altKey) return "Ctrl+U";
    if (e.metaKey && e.altKey) return "Cmd+Opt+U";
  }
  return null;
}

/**
 * Intercepts copy shortcuts (Ctrl/Cmd + C/X/A, Ctrl+Insert), export
 * shortcuts (Ctrl/Cmd + S/P) and DevTools shortcuts (F12,
 * Ctrl+Shift+I/J/C, Cmd+Opt+I/J/C, Ctrl+U, Cmd+Opt+U) in the capture phase.
 *
 * In `"replace"` mode Ctrl/Cmd+C and Ctrl+Insert are deliberately allowed
 * through so the subsequent `copy` event can perform the substitution.
 */
export function createKeyboardFeature(options: ResolvedOptions): Feature {
  const doc = options.target;
  const listenTarget: EventTarget = doc.defaultView ?? doc;

  const handler = (e: Event) => {
    const event = e as KeyboardEvent;

    const shortcut = devtoolsShortcut(event);
    if (shortcut) {
      event.preventDefault();
      options.onViolation?.({
        type: "keyboard",
        originalEvent: event,
        key: shortcut,
      });
      return;
    }

    if (!(event.ctrlKey || event.metaKey)) return;
    const key = physicalKey(event);
    const isInsertCopy =
      event.ctrlKey && !event.shiftKey && event.key === "Insert";
    const isExport = options.print && EXPORT_KEYS.has(key);
    if (!COPY_KEYS.has(key) && !isInsertCopy && !isExport) return;

    // Save/print leak the whole page regardless of focus, so they are
    // blocked even inside editable or excluded regions.
    if (!isExport) {
      const el = eventElement(event);
      // Editable controls (inputs, search boxes) keep native shortcut behavior.
      if (isEditable(el)) return;
      if (isExcluded(el, options.excludeSelectors)) return;
      // Let copy combos reach the copy event where the payload gets replaced.
      if (options.mode === "replace" && (key === "c" || isInsertCopy)) return;
    }

    event.preventDefault();
    const label = isInsertCopy ? "Insert" : key.toUpperCase();
    options.onViolation?.({
      type: "keyboard",
      originalEvent: event,
      key: `${event.metaKey ? "Cmd" : "Ctrl"}+${label}`,
    });
  };

  return {
    attach() {
      listenTarget.addEventListener("keydown", handler, true);
    },
    detach() {
      listenTarget.removeEventListener("keydown", handler, true);
    },
  };
}
