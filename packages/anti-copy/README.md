# @swifty.js/anti-copy

Framework-agnostic copy-protection SDK for browsers, with an optional
VitePress integration.

> **Disclaimer**: client-side copy protection is a _deterrent_, not a
> security boundary. Content remains accessible via view-source, disabled
> JavaScript, or direct HTTP requests.

## Features

- Intercepts `copy` / `cut` events (capture phase)
- Blocks copy shortcuts (`Ctrl/Cmd + C/X/A`) and DevTools shortcuts
  (`F12`, `Ctrl+Shift+I/J/C`, `Ctrl+U`)
- Disables the context menu
- Injects a `user-select: none` stylesheet
- `replace` mode: swaps clipboard payload with a copyright notice instead of blocking
- Heuristic DevTools-open detection (window size delta; deterrent only)
- Region exemptions via CSS selectors; editable controls always stay functional

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

| Option             | Default   | Description                                        |
| ------------------ | --------- | -------------------------------------------------- |
| `mode`             | `"block"` | Cancel copying, or replace the clipboard payload   |
| `replaceText`      | built-in  | String or `(selection) => string` for replace mode |
| `excludeSelectors` | `[]`      | Regions where protection is bypassed               |
| `copy`             | `true`    | Intercept `copy` / `cut` events                    |
| `keyboard`         | `true`    | Intercept copy & DevTools shortcuts                |
| `contextmenu`      | `true`    | Disable right-click menu                           |
| `selectStyle`      | `true`    | Inject `user-select: none` stylesheet              |
| `devtools`         | `false`   | `true` or `{ intervalMs, threshold }`              |
| `onViolation`      | —         | Callback fired on every protection trigger         |

## VitePress integration

```ts
// .vitepress/theme/index.ts
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
  protected: false
  ---
  ```

- Toggles automatically across SPA navigations via the reactive route data.

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
- Opt out per route with `excludePaths` (string prefix or RegExp); protection
  toggles automatically on client-side navigation.

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
export default defineConfig({
  globalUIComponents: [path.join(__dirname, "theme/anti-copy.tsx")],
});
```

- Code blocks (`.rp-codeblock`), the search panel/button and editable
  controls are exempt (`RSPRESS_DEFAULT_EXCLUDES`).
- Opt out per page with frontmatter `protected: false`; the toggle stays in
  sync across client-side navigation via `useFrontmatter()`.

## Testing

```sh
pnpm test
```
