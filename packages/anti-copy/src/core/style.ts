import type { Feature, ResolvedOptions } from "./types";
import { eventElement, isEditable, isExcluded } from "./utils";

const STYLE_ATTR = "data-anti-copy";

/** Always keep editable controls selectable regardless of configuration. */
const EDITABLE_SELECTORS = [
  "input",
  "textarea",
  "[contenteditable='']",
  "[contenteditable='true' i]",
  "[contenteditable='plaintext-only' i]",
];

/**
 * Drops selectors the document cannot parse. One invalid selector in a
 * grouped rule would invalidate the entire rule per the CSS spec, silently
 * killing the editable-control exemptions along with it.
 */
function validSelectors(doc: Document, selectors: string[]): string[] {
  return selectors.filter((selector) => {
    try {
      doc.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  });
}

function buildCss(doc: Document, excludeSelectors: string[]): string {
  const allowed = validSelectors(doc, [
    ...EDITABLE_SELECTORS,
    ...excludeSelectors,
  ]);
  // Re-enable selection inside excluded regions and their descendants:
  // `user-select` does not inherit past an explicit `none`, so descendants
  // must be targeted explicitly. `!important` resists page-level overrides.
  const allowRules = allowed.map((s) => `${s}, ${s} *`).join(",\n");
  return [
    // -webkit-touch-callout suppresses the iOS long-press menu, which never
    // fires a contextmenu event and would bypass protection entirely.
    "body { -webkit-user-select: none !important; user-select: none !important; -webkit-touch-callout: none; }",
    `${allowRules} { -webkit-user-select: text !important; user-select: text !important; }`,
  ].join("\n");
}

/**
 * Injects (and removes) a stylesheet that disables text selection globally,
 * plus a `selectstart` interceptor as a backup for style overrides. Skipped
 * in `"replace"` mode where selection must stay possible.
 */
export function createStyleFeature(options: ResolvedOptions): Feature {
  const doc = options.target;
  const listenTarget: EventTarget = doc.defaultView ?? doc;
  let style: HTMLStyleElement | null = null;

  const selectstartHandler = (e: Event) => {
    const el = eventElement(e);
    if (isEditable(el)) return;
    if (isExcluded(el, options.excludeSelectors)) return;
    e.preventDefault();
    options.onViolation?.({ type: "selection", originalEvent: e });
  };

  return {
    attach() {
      if (!style) {
        style = doc.createElement("style");
        style.setAttribute(STYLE_ATTR, "");
        style.textContent = buildCss(doc, options.excludeSelectors);
        doc.head.appendChild(style);
      }
      if (options.mode !== "replace") {
        listenTarget.addEventListener("selectstart", selectstartHandler, true);
      }
    },
    detach() {
      style?.remove();
      style = null;
      listenTarget.removeEventListener("selectstart", selectstartHandler, true);
    },
  };
}
