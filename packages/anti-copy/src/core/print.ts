import type { Feature, ResolvedOptions } from "./types";

const PRINT_STYLE_ATTR = "data-anti-copy-print";

/**
 * Hides the page in print output (`Ctrl/Cmd+P` → save as PDF would otherwise
 * export the full document) and reports print attempts via `beforeprint`.
 * The keyboard feature additionally blocks the Ctrl/Cmd+P and Ctrl/Cmd+S
 * shortcuts, but the browser menu can still open the print dialog — the
 * `@media print` rule covers that path.
 */
export function createPrintFeature(options: ResolvedOptions): Feature {
  const doc = options.target;
  const view = doc.defaultView;
  let style: HTMLStyleElement | null = null;

  const handler = () => {
    options.onViolation?.({ type: "print" });
  };

  return {
    attach() {
      if (!style) {
        style = doc.createElement("style");
        style.setAttribute(PRINT_STYLE_ATTR, "");
        style.textContent =
          "@media print { body { display: none !important; } }";
        doc.head.appendChild(style);
      }
      view?.addEventListener("beforeprint", handler);
    },
    detach() {
      style?.remove();
      style = null;
      view?.removeEventListener("beforeprint", handler);
    },
  };
}
