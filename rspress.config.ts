import * as path from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";
import mermaid from "rspress-plugin-mermaid";

const appName = "Yukino Homepage";
const basePath = "/h";
const publicOrigin = "https://hangtiancheng.github.io";
const mountUrl = `${publicOrigin}${basePath}`;
const gitRepo = "https://github.com/hangtiancheng/h";
const siteDescription = `Yukino 的个人知识库: 覆盖 Agent、前端与后端的技术笔记。所有链接均为可直接抓取的绝对地址; 每页另有 Markdown 版本 (将页面地址的 .html 后缀替换为 .md), 全站拼接版见 ${mountUrl}/llms-full.txt。`;

// Legacy fumadocs URLs (extensionless pages and /llms.mdx/**/content.md) are
// rewritten client-side so old shared links keep working on GitHub Pages.
const legacyRedirectScript = `<script>(function(){var b="${basePath}",p=location.pathname;if(p.indexOf(b+"/")!==0)return;var r=p.slice(b.length);var m=r.match(/^\\/llms\\.mdx\\/(.+)\\/content\\.md$/);if(m){location.replace(b+"/"+m[1]+".md"+location.search+location.hash);return;}if(r.length>1&&!r.endsWith("/")&&!/\\.[a-zA-Z0-9]+$/.test(r)){location.replace(b+r+".html"+location.search+location.hash);}})();</script>`;

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
    legacyRedirectScript,
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
