import { defineConfig } from "@lark.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/h/lark-docs/",
  title: "Lark.js Homepage",
  // description: "Lark.js Homepage",
  nav: [
    { text: "Base", link: "/h/lark-docs/base/" },
    { text: "Frontend", link: "/h/lark-docs/frontend/" },
    { text: "Backend", link: "/h/lark-docs/backend/" },
    { text: "QA", link: "/h/lark-docs/qa/" },
  ],
  sidebar: {
    "/h/lark-docs/base/": "auto",
    "/h/lark-docs/frontend/": "auto",
    "/h/lark-docs/backend/": "auto",
    "/h/lark-docs/qa/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: true,
});
