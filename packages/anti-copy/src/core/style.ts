import type { Feature, ResolvedOptions } from "./types";

const STYLE_ATTR = "data-anti-copy";

/** Always keep editable controls selectable regardless of configuration. */
const EDITABLE_SELECTORS = [
  "input",
  "textarea",
  "[contenteditable='true']",
  "[contenteditable='']",
];

function buildCss(excludeSelectors: string[]): string {
  const allowed = [...EDITABLE_SELECTORS, ...excludeSelectors];
  // Re-enable selection inside excluded regions and their descendants:
  // `user-select` does not inherit past an explicit `none`, so descendants
  // must be targeted explicitly.
  const allowRules = allowed.map((s) => `${s}, ${s} *`).join(",\n");
  return [
    "body { -webkit-user-select: none; user-select: none; }",
    `${allowRules} { -webkit-user-select: text; user-select: text; }`,
  ].join("\n");
}

/** Injects (and removes) a stylesheet that disables text selection globally. */
export function createStyleFeature(options: ResolvedOptions): Feature {
  const doc = options.target;
  return {
    attach() {
      if (doc.head.querySelector(`style[${STYLE_ATTR}]`)) return;
      const style = doc.createElement("style");
      style.setAttribute(STYLE_ATTR, "");
      style.textContent = buildCss(options.excludeSelectors);
      doc.head.appendChild(style);
    },
    detach() {
      doc.head.querySelector(`style[${STYLE_ATTR}]`)?.remove();
    },
  };
}
