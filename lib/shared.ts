import { createGetUrl } from "fumadocs-core/source";

export const appName = "Yukino Homepage";
export const basePath = "/h";
export const publicOrigin = "https://hangtiancheng.github.io";
export const mountUrl = `${publicOrigin}${basePath}`;
export const docsRoute = "/";
export const docsContentRoute = `${basePath}/llms.mdx`;
export const siteDescription = `Yukino 的个人知识库: 覆盖 Agent、前端与后端的技术笔记。所有链接均为可直接抓取的绝对地址; 每页另有 Markdown 版本 (在页面路径前加 ${docsContentRoute} 前缀、末尾加 /content.md), 全站拼接版见 ${mountUrl}/llms-full.txt。`;

export const gitConfig = {
  user: "hangtiancheng",
  repo: "h",
  branch: "main",
};

const getContentUrl = createGetUrl(docsContentRoute);

export function absolutePageUrl(pageUrl: string): string {
  return `${mountUrl}${pageUrl}`;
}

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getContentUrl(segments, page.locale) };
}
