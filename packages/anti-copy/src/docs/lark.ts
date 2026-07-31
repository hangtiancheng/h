import { Router } from "@lark.js/docs";
import {
  createAntiCopy,
  isBrowser,
  type AntiCopyInstance,
  type AntiCopyOptions,
} from "@/core";
import { DOCS_DEFAULT_EXCLUDES, isPathExcluded } from "./common";

/**
 * Regions excluded from protection by default in a @lark.js/docs site:
 * code blocks (`.codeblock` chrome incl. the copy button), dialogs such as
 * the search palette, and editable controls.
 */
export const LARK_DOCS_DEFAULT_EXCLUDES = DOCS_DEFAULT_EXCLUDES;

export { isPathExcluded };

export interface LarkDocsAntiCopyOptions extends AntiCopyOptions {
  /**
   * Route paths exempt from protection (full paths incl. `baseUrl`).
   * A string matches when the current path equals it or starts with it
   * followed by `/` (trailing slashes on either side are ignored); a RegExp
   * is tested against the full path.
   */
  excludePaths?: (string | RegExp)[];
}

/** Handle returned by {@link applyAntiCopy} for teardown and manual control. */
export interface AntiCopyHandle {
  instance: AntiCopyInstance;
  /** Unsubscribes from router navigation and destroys the instance. */
  stop(): void;
}

/**
 * Wires copy protection into a @lark.js/docs app. Call it once from
 * `app/boot.ts` — before or after `Framework.boot()`:
 *
 * ```ts
 * import { applyAntiCopy } from "@swifty.js/anti-copy/lark-docs";
 * applyAntiCopy({ mode: "replace", excludePaths: ["/docs/playground"] });
 * ```
 *
 * Protection is enabled site-wide by default; routes listed in
 * `excludePaths` opt out. The router's `changed` event is observed so
 * protection toggles correctly across SPA navigations (lark-docs uses
 * history mode, so the current path is read from `location.pathname`).
 */
export function applyAntiCopy(
  options: LarkDocsAntiCopyOptions = {},
): AntiCopyHandle {
  const { excludePaths = [], ...rest } = options;
  const instance = createAntiCopy({
    ...rest,
    excludeSelectors: [
      ...LARK_DOCS_DEFAULT_EXCLUDES,
      ...(rest.excludeSelectors ?? []),
    ],
  });

  // In non-browser environments the instance is already a no-op; skip the
  // router subscription too.
  if (!isBrowser()) {
    return {
      instance,
      stop() {
        /** noop */
      },
    };
  }

  const sync = (): void => {
    if (isPathExcluded(globalThis.location.pathname, excludePaths)) {
      instance.disable();
    } else {
      instance.enable();
    }
  };

  Router.on("changed", sync);
  sync();

  return {
    instance,
    stop() {
      Router.off("changed", sync);
      instance.destroy();
    },
  };
}
