import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/h/",
  title: "Swifty Homepage",
  description: "Swifty Homepage",
  nav: [
    { text: "Base", link: "/h/base/" },
    { text: "Frontend", link: "/h/frontend/" },
    { text: "Backend", link: "/h/backend/" },
    { text: "QA", link: "/h/qa/" },
  ],
  sidebar: {
    "/h/base/": "auto",
    "/h/frontend/": "auto",
    "/h/backend/": "auto",
    "/h/qa/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: true,
});
