import { createGetUrl } from "fumadocs-core/source";

export const appName = "Yukino Homepage";
export const docsRoute = "/";
export const docsContentRoute = "/h/llms.mdx";

export const gitConfig = {
  user: "hangtiancheng",
  repo: "h",
  branch: "main",
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "content.md"];

  return { segments, url: getContentUrl(segments, page.locale) };
}
