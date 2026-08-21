import { defineConfig } from "@lark.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/h/lark-docs/",
  title: "Lark.js Homepage",
  nav: [
    { text: "Base", link: "/base/" },
    { text: "Frontend", link: "/frontend/" },
    { text: "Backend", link: "/backend/" },
    { text: "QA", link: "/qa/" },
  ],
  sidebar: {
    "/base/": "auto",
    "/frontend/": "auto",
    "/backend/": "auto",
    "/qa/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: true,
});
