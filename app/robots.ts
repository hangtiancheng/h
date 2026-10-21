import type { MetadataRoute } from "next";
import { mountUrl } from "@/lib/shared";

export const revalidate = false;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${mountUrl}/sitemap.xml`,
  };
}
