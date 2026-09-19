import { createGetUrl } from "fumadocs-core/source";

export const appName = "Swifty Homepage";
// docs are served from the site root, keeping the rspress URLs
// (e.g. /base/css) unchanged
export const docsRoute = "/";
// OG image URLs are resolved by Next.js metadata against `metadataBase`
// (which already carries the /h basePath), so no prefix here.
export const docsImageRoute = "/og";
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

const getImageUrl = createGetUrl(docsImageRoute);

export function getPageImageUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, "image.png"];

  return { segments, url: getImageUrl(segments, page.locale) };
}
