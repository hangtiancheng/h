/** Whether the current runtime provides a usable DOM. */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * Returns `true` when the event target falls inside a region excluded from
 * protection. Text nodes fall back to their parent element; non-node targets
 * (window, document) are never excluded.
 */
export function isExcluded(
  target: EventTarget | null,
  selectors: string[],
): boolean {
  let el: Element | null = null;
  if (target instanceof Element) {
    el = target;
  } else if (target instanceof Node) {
    el = target.parentElement;
  }
  if (!el) return false;

  return selectors.some((selector) => {
    try {
      return el.closest(selector) !== null;
    } catch {
      // Invalid selectors must not break protection for the rest.
      return false;
    }
  });
}

/** Whether the target is an editable control where shortcuts must stay functional. */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return true;
  }
  return (
    target.closest("[contenteditable='true'], [contenteditable='']") !== null
  );
}
