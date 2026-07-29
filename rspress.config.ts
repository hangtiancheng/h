import { join } from "node:path";
import { defineConfig } from "@rspress/core";
import rspressPluginMermaid from "rspress-plugin-mermaid";

export default defineConfig({
  root: "docs",
  base: "/h/rspress/",
  outDir: "dist-rspress",
  globalStyles: join(import.meta.dirname, "rspress/main.css"),
  globalUIComponents: [join(import.meta.dirname, "rspress/anti-copy.tsx")],
  plugins: [rspressPluginMermaid()],
  lang: "zh",
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
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/hangtiancheng",
      },
    ],
    editLink: {
      docRepoBaseUrl: "https://github.com/hangtiancheng/h/tree/main/docs",
    },
  },
});
