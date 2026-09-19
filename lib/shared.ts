import { createGetUrl } from "fumadocs-core/source";

export const appName = "Swifty Homepage";
// docs are served from the site root, keeping the rspress URLs
// (e.g. /base/css) unchanged
export const docsRoute = "/";
// Markdown URLs are consumed client-side (fetch / plain anchors) where
// Next's basePath is not applied automatically, so carry /h explicitly.
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
