import type { Feature, ResolvedOptions } from "./types";
import { isEditable, isExcluded } from "./utils";

/** Suppresses the context menu outside excluded regions and editable controls. */
export function createContextmenuFeature(options: ResolvedOptions): Feature {
  const doc = options.target;

  const handler = (e: Event) => {
    if (isEditable(e.target)) return;
    if (isExcluded(e.target, options.excludeSelectors)) return;
    e.preventDefault();
    options.onViolation?.({ type: "contextmenu", originalEvent: e });
  };

  return {
    attach() {
      doc.addEventListener("contextmenu", handler, true);
    },
    detach() {
      doc.removeEventListener("contextmenu", handler, true);
    },
  };
}
