import { useEffect, useMemo } from "react";
import { useFrontmatter } from "@rspress/core/runtime";
import { createAntiCopy, type AntiCopyOptions } from "../core/index";

/**
 * Regions excluded from protection by default in an Rspress site:
 * code blocks (`.rp-codeblock` chrome incl. the copy button), the search
 * panel, and editable controls.
 */
export const RSPRESS_DEFAULT_EXCLUDES = [
  ".rp-codeblock",
  ".rp-search-panel",
  ".rp-search-button",
  "input",
  "textarea",
  "[contenteditable='true']",
];

/**
 * Renderless React component wiring copy protection into an Rspress app.
 * Register it through `globalUIComponents` via a small wrapper module with
 * a default export so it mounts on every page.
 *
 * Do not pass props through the `globalUIComponents: [[path, props]]` tuple
 * form — Rspress serializes those props with `JSON.stringify`, silently
 * dropping functions such as `replaceText` and `onViolation`. A wrapper
 * component keeps every option intact.
 *
 * Protection is enabled site-wide by default; individual pages opt out with
 * `copyable: true` in their frontmatter. The reactive frontmatter from
 * `useFrontmatter()` keeps the toggle in sync across client-side navigation.
 * SSG-safe: the underlying instance is a no-op outside the browser.
 */
export function AntiCopy(props: AntiCopyOptions): null {
  const { frontmatter } = useFrontmatter();

  // The instance lives for the component's lifetime; options changes require a remount.
  const instance = useMemo(
    () =>
      createAntiCopy({
        ...props,
        excludeSelectors: [
          ...RSPRESS_DEFAULT_EXCLUDES,
          ...(props.excludeSelectors ?? []),
        ],
      }),
    [],
  );

  useEffect(() => {
    if (frontmatter?.copyable) instance.disable();
    else instance.enable();
  }, [frontmatter]);

  // disable (not destroy) so a StrictMode-style remount can re-enable the
  // memoized instance; destroy() would retire it permanently.
  useEffect(() => () => instance.disable(), []);

  return null;
}
