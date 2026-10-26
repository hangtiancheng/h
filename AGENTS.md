# AGENTS.md

Ignore chunks directory

## Docs site (Rspress v2)

- Static site built with Rspress v2 (`@rspress/core`): config in `rspress.config.ts`, content in `docs/`, theme overrides in `theme/`, static assets in `docs/public/`.
- `pnpm dev` / `pnpm build` / `pnpm preview`; build output goes to `out/`, deployed to GitHub Pages under base `/h`.
- Navbar comes from `docs/_nav.json`; per-section sidebars come from `docs/<section>/_meta.json`.
- `Tabs`, `Tab`, and `Callout` are imported per page from `@rspress/core/theme-original` (e.g. `import { Tabs, Tab, Callout } from "@rspress/core/theme-original";`); `mermaid` code blocks are rendered by `rspress-plugin-mermaid`.
- `llms: true` emits `llms.txt`, `llms-full.txt`, and a Markdown version of every page (page URL with `.html` replaced by `.md`).
