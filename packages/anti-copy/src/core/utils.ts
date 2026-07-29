/** Whether the current runtime provides a usable DOM. */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

const ELEMENT_NODE = 1;

/**
 * Converts an event target to an element via duck typing instead of
 * `instanceof`, so nodes from other realms (iframes, injected documents)
 * still resolve. Text nodes fall back to their parent element, crossing
 * a shadow-root boundary to its host when needed.
 */
function toElement(target: EventTarget | null): Element | null {
  if (!target || typeof (target as Node).nodeType !== "number") return null;
  const node = target as Node;
  if (node.nodeType === ELEMENT_NODE) return node as Element;
  if (node.parentElement) return node.parentElement;
  // A text node directly under a ShadowRoot has no parentElement.
  const parent = node.parentNode;
  const host = parent && (parent as ShadowRoot).host;
  return host ?? null;
}

/** Shadow host of the element's root, used to continue ancestor walks upward. */
function shadowHost(el: Element): Element | null {
  const root = el.getRootNode?.();
  const host = root && (root as ShadowRoot).host;
  return host && host !== el ? host : null;
}

/**
 * Resolves the most specific element for an event. `composedPath()` looks
 * through open shadow roots, where `event.target` is retargeted to the host.
 */
export function eventElement(event: Event): Element | null {
  const path = event.composedPath?.();
  return toElement(path && path.length > 0 ? path[0] : event.target);
}

/**
 * Returns `true` when the target falls inside a region excluded from
 * protection. Walks up through shadow boundaries; non-node targets
 * (window, document) are never excluded.
 */
export function isExcluded(
  target: EventTarget | null,
  selectors: string[],
): boolean {
  let el = toElement(target);
  while (el) {
    for (const selector of selectors) {
      try {
        if (el.closest(selector) !== null) return true;
      } catch {
        // Invalid selectors must not break protection for the rest.
      }
    }
    // `closest` stops at the shadow root; resume from the host.
    el = shadowHost(el);
  }
  return false;
}

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA"]);
// The contenteditable attribute value is ASCII case-insensitive in HTML.
const EDITABLE_VALUES = new Set(["", "true", "plaintext-only"]);

/** Whether the target is an editable control where shortcuts must stay functional. */
export function isEditable(target: EventTarget | null): boolean {
  let el = toElement(target);
  while (el) {
    if (EDITABLE_TAGS.has(el.tagName)) return true;
    const attr = el.getAttribute("contenteditable");
    if (attr !== null && EDITABLE_VALUES.has(attr.toLowerCase())) return true;
    el = el.parentElement ?? shadowHost(el);
  }
  return false;
}

/**
 * Whether the current selection falls entirely inside excluded regions.
 * Judging only `event.target` would let a selection that starts inside an
 * excluded region and extends into protected content leak through, because
 * the copy event fires on the selection's start node.
 *
 * Returns `null` when there is no usable (non-collapsed) selection, so the
 * caller can fall back to a target-based check.
 */
export function isSelectionExcluded(
  doc: Document,
  selectors: string[],
): boolean | null {
  if (selectors.length === 0) return null;
  const selection = doc.defaultView?.getSelection?.() ?? null;
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i);
    if (!isExcluded(range.commonAncestorContainer, selectors)) return false;
  }
  return true;
}

/** Escapes text for safe embedding in an HTML clipboard flavor. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
