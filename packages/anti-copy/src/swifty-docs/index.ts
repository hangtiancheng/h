import { useLocation } from "preact-iso";
import { useEffect, useMemo } from "preact/hooks";
import { createAntiCopy, type AntiCopyOptions } from "@/core";

/**
 * Regions excluded from protection by default in a @swifty.js/docs site:
 * code blocks (`.codeblock` chrome incl. the copy button), dialogs such as
 * the search palette, and editable controls.
 */
export const SWIFTY_DOCS_DEFAULT_EXCLUDES = [
  ".codeblock",
  "[role='dialog']",
  "input",
  "textarea",
  "[contenteditable='true']",
];

export interface SwiftyDocsAntiCopyProps extends AntiCopyOptions {
  /**
   * Route paths exempt from protection. A string matches when the current
   * path equals it or starts with it followed by `/` (trailing slashes on
   * either side are ignored); a RegExp is tested against the full path.
   */
  excludePaths?: (string | RegExp)[];
}

function stripTrailingSlash(path: string): string {
  const stripped = path.replace(/\/+$/, "");
  return stripped === "" ? "/" : stripped;
}

/** Exported for testing. */
export function isPathExcluded(
  path: string,
  patterns: (string | RegExp)[],
): boolean {
  const current = stripTrailingSlash(path);
  return patterns.some((pattern) => {
    if (typeof pattern !== "string") return pattern.test(path);
    const prefix = stripTrailingSlash(pattern);
    return current === prefix || current.startsWith(`${prefix}/`);
  });
}

/**
 * Renderless Preact component wiring copy protection into a @swifty.js/docs
 * app. Mount it anywhere inside `<LocationProvider>` so protection toggles
 * with client-side navigation:
 *
 * ```tsx
 * <LocationProvider>
 *   <AntiCopy mode="replace" excludePaths={["/playground"]} devtools />
 *   <Router>...</Router>
 * </LocationProvider>
 * ```
 */
export function AntiCopy(props: SwiftyDocsAntiCopyProps): null {
  const { excludePaths = [], ...options } = props;
  const { path } = useLocation();

  // The instance lives for the component's lifetime; options changes require a remount.
  const instance = useMemo(
    () =>
      createAntiCopy({
        ...options,
        excludeSelectors: [
          ...SWIFTY_DOCS_DEFAULT_EXCLUDES,
          ...(options.excludeSelectors ?? []),
        ],
      }),
    [],
  );

  // Serialized so changes to the excludePaths array retrigger the effect.
  const excludeKey = excludePaths.map(String).join("\n");

  useEffect(() => {
    if (isPathExcluded(path, excludePaths)) instance.disable();
    else instance.enable();
  }, [path, excludeKey]);

  useEffect(() => () => instance.disable(), []);

  return null;
}
