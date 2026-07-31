import { defineConfig } from "@swifty.js/docs/vite";

export default defineConfig({
  docs: "docs",
  baseUrl: "/h/swifty-docs/",
  title: "Swifty Homepage",
  nav: [
    { text: "Base", link: "/h/swifty-docs/base/" },
    { text: "Frontend", link: "/h/swifty-docs/frontend/" },
    { text: "Backend", link: "/h/swifty-docs/backend/" },
    { text: "QA", link: "/h/swifty-docs/qa/" },
  ],
  sidebar: {
    "/h/swifty-docs/base/": "auto",
    "/h/swifty-docs/frontend/": "auto",
    "/h/swifty-docs/backend/": "auto",
    "/h/swifty-docs/qa/": "auto",
  },
  highlight: { theme: "github-light", darkTheme: "github-dark" },
  search: true,
});
