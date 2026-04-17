// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import mermaid from "astro-mermaid";

// https://astro.build/config
export default defineConfig({
  site: "https://hangtiancheng.github.io",
  base: "/h",
  integrations: [
    mermaid({
      autoTheme: true,
      theme: "default",
    }),
    starlight({
      title: "homepage",
      favicon: "/favicon.svg",
      customCss: ["./src/styles/index.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/hangtiancheng",
        },
      ],
      sidebar: [
        {
          label: "base",
          autogenerate: { directory: "base" },
        },
        {
          label: "frontend",
          autogenerate: { directory: "frontend" },
        },
        {
          label: "backend",
          autogenerate: { directory: "backend" },
        },
      ],
    }),
  ],
});
