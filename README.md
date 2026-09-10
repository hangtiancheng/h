<div align="center">

<img src="docs/public/favicon.svg" alt="Swifty Homepage" width="96" />

# Homepage

**A personal technical knowledge base covering base engineering topics, frontend,
and backend — plus an algorithm notebook and first-party Rspress plugins.**

Built with [Rspress](https://rspress.dev/), deployed to GitHub Pages at
<https://hangtiancheng.github.io/h/>.

![Rspress](https://img.shields.io/badge/Rspress-2.x-0ea5e9?logo=rspress&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-enabled-5A0FC8?logo=pwa&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-f5a623.svg)

</div>

---

## What's inside

| Area         | Topics                                                                                          |
| ------------ | ----------------------------------------------------------------------------------------------- |
| **Base**     | CSS, Git, JavaScript/TypeScript, Go, Linux, Networking, and a 15-chapter agent primer           |
| **Frontend** | React, Next.js, React Router, RSC, Vite, Vitest, Vue 3, Vue Router, Pinia, Zustand, Lit, Sentry |
| **Backend**  | MySQL, Redis                                                                                    |
| **QA**       | Interview-style question banks                                                                  |

The `src/` directory additionally holds an **algorithm notebook** — curated
solutions in Go, JavaScript, and TypeScript for dynamic programming, graphs,
heaps, and other classic problem families — with an ACM-style stdin/stdout
harness.

## Getting started

Prerequisites: **Node.js 20+** and **pnpm**.

```sh
pnpm install
pnpm dev       # start the dev server with HMR
```

| Command          | Description                             |
| ---------------- | --------------------------------------- |
| `pnpm dev`       | Start the local dev server              |
| `pnpm build`     | Build the static site into `doc_build/` |
| `pnpm preview`   | Preview the production build            |
| `pnpm typecheck` | Type-check the repo                     |
| `pnpm lint`      | Lint and auto-fix with ESLint           |
| `pnpm format`    | Format the repo with Prettier           |

## Repository layout

```
h/
├── docs/                        # Rspress content root
├── src/                         # algorithm notebook (Go / JS / TS)
├── packages/
│   └── rspress-plugin-mermaid/  # Mermaid diagram plugin (published)
├── theme/                       # global styles
└── rspress.config.ts            # Rspress + sitemap + mermaid + PWA config
```

The site ships as an installable **PWA** (offline caching via Workbox) and renders
**Mermaid** diagrams through the first-party
[`@swifty.js/rspress-plugin-mermaid`](./packages/rspress-plugin-mermaid) plugin.
