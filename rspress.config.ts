import { defineConfig } from "@rspress/core";

export default defineConfig({
  root: "docs",
  base: "/h/rspress/",
  outDir: "doc_build",
  lang: "zh-CN",
  title: "Swifty Homepage",
  description: "Swifty Homepage",
  icon: "/favicon.ico",
  logo: "/favicon.svg",
  markdown: {
    showLineNumbers: true,
  },
  themeConfig: {
    lastUpdated: true,
    enableScrollToTop: true,
    outline: true,
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/hangtiancheng",
      },
    ],
    editLink: {
      docRepoBaseUrl: "https://github.com/hangtiancheng/h/tree/main/docs",
      text: "Edit this page on GitHub",
    },
  },
});
