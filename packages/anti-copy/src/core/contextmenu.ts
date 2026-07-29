import type { Feature, ResolvedOptions } from "./types";
import { eventElement, isEditable, isExcluded } from "./utils";

/** Suppresses the context menu outside excluded regions and editable controls. */
export function createContextmenuFeature(options: ResolvedOptions): Feature {
  const doc = options.target;
  const listenTarget: EventTarget = doc.defaultView ?? doc;

  const handler = (e: Event) => {
    const el = eventElement(e);
    if (isEditable(el)) return;
    if (isExcluded(el, options.excludeSelectors)) return;
    e.preventDefault();
    options.onViolation?.({ type: "contextmenu", originalEvent: e });
  };

  return {
    attach() {
      listenTarget.addEventListener("contextmenu", handler, true);
    },
    detach() {
      listenTarget.removeEventListener("contextmenu", handler, true);
    },
  };
}
