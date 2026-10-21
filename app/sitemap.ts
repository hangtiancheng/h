import type { MetadataRoute } from "next";
import { absolutePageUrl, mountUrl } from "@/lib/shared";
import { source } from "@/lib/source";

export const revalidate = false;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${mountUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${mountUrl}/resume`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...source.getPages().map((page) => ({
      url: absolutePageUrl(page.url),
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
  ];
}
