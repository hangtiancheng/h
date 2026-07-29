import type { Feature, ResolvedOptions } from "./types";
import { eventElement, isEditable, isExcluded } from "./utils";

const COPY_KEYS = new Set(["c", "x", "a"]);
// Ctrl/Cmd+S (save page) and Ctrl/Cmd+P (print) leak the full document.
const EXPORT_KEYS = new Set(["s", "p"]);
const DEVTOOLS_KEYS = new Set(["i", "j", "c"]);
const VIEW_SOURCE_KEYS = new Set(["u"]);

/**
 * Matches a shortcut against both the layout character (`e.key`) and the
 * physical key (`e.code`), returning the matched character or null.
 *
 * Either alone is bypassable: `e.key` misses non-Latin layouts (Cyrillic
 * "с") and macOS Option dead keys, while `e.code` alone would miss remapped
 * Latin layouts (AZERTY/Dvorak, where the browser acts on `e.key`). The
 * union may over-block (e.g. AZERTY Ctrl+Q on physical KeyA), which is the
 * safe direction for copy protection.
 */
function matchKey(e: KeyboardEvent, keys: Set<string>): string | null {
  const key = e.key.toLowerCase();
  if (keys.has(key)) return key;
  if (e.code && e.code.startsWith("Key") && e.code.length === 4) {
    const code = e.code.slice(3).toLowerCase();
    if (keys.has(code)) return code;
  }
  return null;
}

/** Returns a shortcut description like "Ctrl+Shift+I" when the combo targets DevTools. */
function devtoolsShortcut(e: KeyboardEvent): string | null {
  if (e.key === "F12" || e.code === "F12") return "F12";
  const key = matchKey(e, DEVTOOLS_KEYS);
  // Windows/Linux: Ctrl+Shift+I/J/C — macOS: Cmd+Opt+I/J/C
  if (key && ((e.ctrlKey && e.shiftKey) || (e.metaKey && e.altKey))) {
    return `${e.metaKey ? "Cmd+Opt" : "Ctrl+Shift"}+${key.toUpperCase()}`;
  }
  // View-source: Ctrl+U on Windows/Linux, Cmd+Opt+U on macOS.
  if (!e.shiftKey && matchKey(e, VIEW_SOURCE_KEYS)) {
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
    const copyKey = matchKey(event, COPY_KEYS);
    const isInsertCopy =
      event.ctrlKey && !event.shiftKey && event.key === "Insert";
    const exportKey = options.print ? matchKey(event, EXPORT_KEYS) : null;
    if (!copyKey && !isInsertCopy && !exportKey) return;

    // Save/print leak the whole page regardless of focus, so they are
    // blocked even inside editable or excluded regions.
    if (!exportKey) {
      const el = eventElement(event);
      // Editable controls (inputs, search boxes) keep native shortcut behavior.
      if (isEditable(el)) return;
      if (isExcluded(el, options.excludeSelectors)) return;
      // Let copy combos reach the copy event where the payload gets replaced.
      if (options.mode === "replace" && (copyKey === "c" || isInsertCopy)) {
        return;
      }
    }

    event.preventDefault();
    const label = isInsertCopy
      ? "Insert"
      : (exportKey ?? copyKey ?? "").toUpperCase();
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
