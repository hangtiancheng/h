<div align="center">

<img src="website/public/favicon.svg" alt="Swifty Homepage" width="96" />

# Homepage

**A personal technical knowledge base covering base engineering topics, frontend,
and backend — plus an algorithm notebook.**

Built with [Next.js](https://nextjs.org/) and [Fumadocs](https://fumadocs.dev/),
deployed to GitHub Pages at <https://hangtiancheng.github.io/h/>.

![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)
![Fumadocs](https://img.shields.io/badge/Fumadocs-16-171717)
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

The `src/` directory additionally holds an **algorithm notebook** — curated
solutions in Go, JavaScript, and TypeScript for dynamic programming, graphs,
heaps, and other classic problem families — with an ACM-style stdin/stdout
harness.

## Getting started

Prerequisites: **Node.js 20+** and **pnpm**.

```sh
pnpm install
pnpm dev       # start the dev server with HMR (http://localhost:3000/h)
```

| Command          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `pnpm dev`       | Start the local dev server                     |
| `pnpm build`     | Statically export the site into `website/out/` |
| `pnpm typecheck` | Type-check the repo                            |
| `pnpm lint`      | Lint and auto-fix with ESLint                  |
| `pnpm format`    | Format the repo with Prettier                  |

## Repository layout

```
h/
├── website/                     # Next.js + Fumadocs site
│   ├── app/                     # routes: home, docs catch-all, search API,
│   │                            #         llms.txt / llms.mdx, OG images
│   ├── components/              # provider, search dialog, MDX components
│   ├── content/docs/            # MDX/MD content (base / backend / frontend)
│   ├── lib/                     # source, shared config & layout options
│   └── public/                  # static assets
└── src/                         # algorithm notebook (Go / JS / TS)
```
