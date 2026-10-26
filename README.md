<div align="center">

<img src="docs/public/favicon.svg" alt="Yukino Homepage" width="96" />

# Homepage

**A personal technical knowledge base covering base engineering topics, frontend,
and backend — plus an algorithm notebook.**

Built with [Rspress](https://rspress.rs/), deployed to GitHub Pages at
<https://hangtiancheng.github.io/h/>.

![Rspress](https://img.shields.io/badge/Rspress-2-0095ff)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Go](https://img.shields.io/badge/Go-1.26-00ADD8?logo=go&logoColor=white)
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

The `chucks/` directory additionally holds an **algorithm notebook** — curated
solutions in Go, JavaScript, and TypeScript for dynamic programming, graphs,
heaps, and other classic problem families — with an ACM-style stdin/stdout
harness.

## Getting started

Prerequisites: **Node.js 20+** and **pnpm**.

```sh
pnpm install
pnpm dev       # start the dev server with HMR (http://localhost:3000/h)
```

| Command          | Description                           |
| ---------------- | ------------------------------------- |
| `pnpm dev`       | Start the local dev server            |
| `pnpm build`     | Statically build the site into `out/` |
| `pnpm preview`   | Preview the production build locally  |
| `pnpm typecheck` | Type-check the repo                   |
| `pnpm lint`      | Lint and auto-fix with ESLint         |
| `pnpm format`    | Format the repo with Prettier         |

## Repository layout

```
h/                               # Rspress site
├── docs/                        # MDX/MD content (base / backend / frontend),
│                                # home & resume pages, _nav.json / _meta.json
├── docs/public/                 # static assets (favicon, robots.txt, ...)
├── theme/                       # MDX component wrappers & global styles
│                                # (brand color, fonts, resume frame)
├── rspress.config.ts            # site config (base /h, llms, sitemap, mermaid)
└── chucks/                      # algorithm notebook (Go / JS / TS)
```

## Machine-readable outputs

- `llms.txt` / `llms-full.txt` are generated at the site root.
- Every page has a Markdown version: replace the `.html` suffix of its URL with
  `.md` (e.g. <https://hangtiancheng.github.io/h/base/js.md>).
