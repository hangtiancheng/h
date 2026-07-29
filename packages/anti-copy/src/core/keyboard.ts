import type { Feature, ResolvedOptions } from "./types";
import { isEditable, isExcluded } from "./utils";

const COPY_KEYS = new Set(["c", "x", "a"]);

/** Returns a shortcut description like "Ctrl+Shift+I" when the combo targets DevTools. */
function devtoolsShortcut(e: KeyboardEvent): string | null {
  if (e.key === "F12") return "F12";
  const key = e.key.toLowerCase();
  // Windows/Linux: Ctrl+Shift+I/J/C — macOS: Cmd+Opt+I/J/C
  if (
    (e.ctrlKey && e.shiftKey && ["i", "j", "c"].includes(key)) ||
    (e.metaKey && e.altKey && ["i", "j", "c"].includes(key))
  ) {
    return `${e.metaKey ? "Cmd+Opt" : "Ctrl+Shift"}+${key.toUpperCase()}`;
  }
  // View-source shortcut.
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === "u") {
    return `${e.metaKey ? "Cmd" : "Ctrl"}+U`;
  }
  return null;
}

/**
 * Intercepts copy-related shortcuts (Ctrl/Cmd + C/X/A) and DevTools shortcuts
 * (F12, Ctrl+Shift+I/J/C, Ctrl+U) in the capture phase.
 *
 * In `"replace"` mode Ctrl/Cmd+C is deliberately allowed through so the
 * subsequent `copy` event can perform the clipboard substitution.
 */
export function createKeyboardFeature(options: ResolvedOptions): Feature {
  const doc = options.target;

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
    const key = event.key.toLowerCase();
    if (!COPY_KEYS.has(key)) return;

    // Editable controls (inputs, search boxes) keep native shortcut behavior.
    if (isEditable(event.target)) return;
    if (isExcluded(event.target, options.excludeSelectors)) return;
    // Let Ctrl/Cmd+C reach the copy event where the payload gets replaced.
    if (options.mode === "replace" && key === "c") return;

    event.preventDefault();
    options.onViolation?.({
      type: "keyboard",
      originalEvent: event,
      key: `${event.metaKey ? "Cmd" : "Ctrl"}+${key.toUpperCase()}`,
    });
  };

  return {
    attach() {
      doc.addEventListener("keydown", handler, true);
    },
    detach() {
      doc.removeEventListener("keydown", handler, true);
    },
  };
}
