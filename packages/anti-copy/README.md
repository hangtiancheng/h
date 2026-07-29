# @swifty.js/anti-copy

Framework-agnostic copy-protection SDK for browsers, with VitePress,
Rspress and @swifty.js/docs integrations.

> **Disclaimer**: client-side copy protection is a _deterrent_, not a
> security boundary. Content remains accessible via view-source, disabled
> JavaScript, or direct HTTP requests.

## Features

- Intercepts `copy` / `cut` / `dragstart` events (capture phase, on `window`)
- Blocks copy shortcuts by **physical key** (`e.code`), so non-Latin keyboard
  layouts cannot bypass: `Ctrl/Cmd + C/X/A`, `Ctrl+Insert`, and DevTools /
  view-source shortcuts (`F12`, `Ctrl+Shift+I/J/C`, `Cmd+Opt+I/J/C`, `Ctrl+U`,
  `Cmd+Opt+U`)
- Blocks export shortcuts (`Ctrl/Cmd + S/P`) and hides content in print
  output via `@media print` (menu-initiated printing included)
- Disables the context menu and `selectstart`
- Injects a `user-select: none !important` stylesheet incl.
  `-webkit-touch-callout: none` for iOS long-press
- `replace` mode: swaps clipboard payload (text + escaped HTML flavor) with a
  copyright notice instead of blocking
- Heuristic DevTools-open detection (window size delta; deterrent only)
- Region exemptions via CSS selectors, judged against the **whole selection**
  (a selection spanning excluded and protected content stays blocked);
  editable controls always keep native behavior, incl. inside open shadow roots

## Core usage (framework agnostic)

```ts
import { createAntiCopy } from "@swifty.js/anti-copy";

const antiCopy = createAntiCopy({
  mode: "replace", // "block" | "replace"
  replaceText: (selection) => `${selection.slice(0, 60)}… — © example.com`,
  excludeSelectors: ["pre code"],
  devtools: true,
  onViolation: (e) => console.warn("[anti-copy]", e.type),
});

antiCopy.enable();
// antiCopy.disable(); antiCopy.destroy(); antiCopy.update({...});
```

`createAntiCopy` is SSR-safe: in non-browser environments it returns an
inert no-op instance.

### Options

| Option             | Default    | Description                                                                        |
| ------------------ | ---------- | ---------------------------------------------------------------------------------- |
| `mode`             | `"block"`  | Cancel copying, or replace the clipboard payload                                   |
| `replaceText`      | built-in   | String or `(selection) => string` for replace mode                                 |
| `excludeSelectors` | `[]`       | Regions where protection is bypassed (invalid selectors are dropped, never fatal)  |
| `copy`             | `true`     | Intercept `copy` / `cut` / `dragstart` events                                      |
| `keyboard`         | `true`     | Intercept copy, export & DevTools shortcuts                                        |
| `contextmenu`      | `true`     | Disable right-click menu                                                           |
| `selectStyle`      | mode-aware | `user-select: none` + `selectstart`; `true` in block mode, `false` in replace mode |
| `print`            | `true`     | `@media print` hiding, `beforeprint` reporting, `Ctrl/Cmd+S/P` blocking            |
| `devtools`         | `false`    | `true` or `{ intervalMs, threshold }`                                              |
| `onViolation`      | —          | Callback fired on every protection trigger                                         |
| `target`           | `document` | Document to protect; injectable for tests and iframes                              |

Violation types: `copy`, `cut`, `drag`, `selection`, `keyboard`,
`contextmenu`, `print`, `devtools`.

`update(patch)` deep-merges the nested `devtools` object; other fields are
replaced wholesale.

## VitePress integration

```ts
// .vitepress/theme/index.ts
import DefaultTheme from "vitepress/theme";
import { applyAntiCopy } from "@swifty.js/anti-copy/vitepress";

export default {
  extends: DefaultTheme,
  enhanceApp(ctx) {
    applyAntiCopy(ctx, { mode: "replace", devtools: true });
  },
};
```

- Enabled site-wide by default; code blocks, the copy button, inputs and the
  local search box are exempt (`VITEPRESS_DEFAULT_EXCLUDES`).
- Opt out per page with frontmatter:

  ```yaml
  ---
  copyable: true
  ---
  ```

- Toggles automatically across SPA navigations via the reactive route data.
- Returns `{ instance, stop }` — call `stop()` to remove the watcher and all
  listeners (useful in tests or HMR-heavy setups).

When consuming the package as raw TypeScript sources inside a workspace,
add to the VitePress `vite` config:

```ts
vite: {
  optimizeDeps: { exclude: ["@swifty.js/anti-copy"] },
  ssr: { noExternal: ["@swifty.js/anti-copy"] },
}
```

## @swifty.js/docs integration

Mount the renderless `AntiCopy` component anywhere inside preact-iso's
`<LocationProvider>`:

```tsx
import { AntiCopy } from "@swifty.js/anti-copy/swifty-docs";

<LocationProvider>
  <AntiCopy mode="replace" excludePaths={["/playground"]} devtools />
  <Router>...</Router>
</LocationProvider>;
```

- Code blocks (`.codeblock`), dialogs (`[role="dialog"]`, incl. the search
  palette) and editable controls are exempt (`SWIFTY_DOCS_DEFAULT_EXCLUDES`).
- Opt out per route with `excludePaths` (string prefix or RegExp; trailing
  slashes are normalized on both sides); protection toggles automatically on
  client-side navigation.

## Rspress integration

Create a small wrapper with a default export and register it through
`globalUIComponents`:

```tsx
// theme/anti-copy.tsx
import { AntiCopy } from "@swifty.js/anti-copy/rspress";

export default function GlobalAntiCopy() {
  return <AntiCopy mode="replace" devtools />;
}
```

```ts
// rspress.config.ts
import { defineConfig } from "@rspress/core";
import path from "node:path";

export default defineConfig({
  globalUIComponents: [path.join(import.meta.dirname, "theme/anti-copy.tsx")],
});
```

> Do **not** pass options through the `globalUIComponents: [[path, props]]`
> tuple form: Rspress serializes those props with `JSON.stringify`, silently
> dropping functions such as `replaceText` and `onViolation`. Always use a
> wrapper component as shown above.

- Code blocks (`.rp-codeblock`), the search panel/button and editable
  controls are exempt (`RSPRESS_DEFAULT_EXCLUDES`).
- Opt out per page with frontmatter `copyable: true`; the toggle stays in
  sync across client-side navigation via `useFrontmatter()`.

## Known limitations

By design (client-side JS cannot prevent these):

- View-source, `curl`, reader mode, disabled JavaScript.
- Undocked DevTools windows are undetectable; browser zoom may cause
  devtools-detector false positives.
- Scripts registered on `window` before this plugin can pre-empt the
  capture-phase listeners.

## Testing

```sh
pnpm test
```
