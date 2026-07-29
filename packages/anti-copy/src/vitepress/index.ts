import type { EnhanceAppContext } from "vitepress";
import { watch } from "vue";
import { createAntiCopy, type AntiCopyOptions } from "../core/index";

/**
 * Regions excluded from protection by default in a VitePress site:
 * code blocks (selectable + native copy button) and interactive inputs
 * such as the local search box.
 */
export const VITEPRESS_DEFAULT_EXCLUDES = [
  'div[class*="language-"]',
  "button.copy",
  "input",
  "textarea",
  "[contenteditable='true']",
  ".VPLocalSearchBox",
];

/**
 * Wires copy protection into a VitePress app. Call from the theme's
 * `enhanceApp(ctx)` hook.
 *
 * Protection is enabled site-wide by default; individual pages opt out with
 * `copyable: false` in their frontmatter. The router's reactive route data
 * is watched so protection toggles correctly across SPA navigations.
 */
export function applyAntiCopy(
  ctx: EnhanceAppContext,
  options: AntiCopyOptions = {},
): void {
  if (import.meta.env.SSR) return;

  const instance = createAntiCopy({
    ...options,
    excludeSelectors: [
      ...VITEPRESS_DEFAULT_EXCLUDES,
      ...(options.excludeSelectors ?? []),
    ],
  });

  watch(
    () => ctx.router.route.data?.frontmatter?.copyable,
    (value) => {
      if (value) instance.disable();
      else instance.enable();
    },
    { immediate: true },
  );
}
