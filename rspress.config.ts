import * as path from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";
import mermaid from "rspress-plugin-mermaid";

const appName = "Yukino Homepage";
const basePath = "/h";
const publicOrigin = "https://hangtiancheng.github.io";
const mountUrl = `${publicOrigin}${basePath}`;
const gitRepo = "https://github.com/hangtiancheng/h";
const siteDescription = `Yukino knowledge base: ${mountUrl}/llms-full.txt`;

export default defineConfig({
  root: path.join(__dirname, "docs"),
  base: basePath,
  siteOrigin: publicOrigin,
  lang: "zh-CN",
  i18nSource: (source) => {
    for (const key of Object.keys(source)) {
      const zh = source[key].zh;
      if (zh) source[key]["zh-CN"] = zh;
    }
    return source;
  },
  title: appName,
  description: siteDescription,
  icon: "/favicon.svg",
  logo: "/favicon.svg",
  logoText: appName,
  outDir: "out",
  llms: true,
  globalStyles: path.join(__dirname, "theme/styles.css"),
  head: [
    ["meta", { property: "og:title", content: appName }],
    ["meta", { property: "og:description", content: siteDescription }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:url", content: `${mountUrl}/` }],
    ["meta", { property: "og:locale", content: "zh_CN" }],
    [
      "meta",
      {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: "#f5f5f5",
      },
    ],
    [
      "meta",
      {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: "#121212",
      },
    ],
  ],
  markdown: {
    showLineNumbers: true,
  },
  themeConfig: {
    lastUpdated: true,
    editLink: {
      docRepoBaseUrl: `${gitRepo}/tree/main/docs`,
    },
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: gitRepo,
      },
    ],
  },
  plugins: [mermaid(), pluginSitemap({ siteUrl: mountUrl })],
});
