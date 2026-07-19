import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type DefaultTheme } from "vitepress";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import type { PluginOption } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const docsDir = join(rootDir, "../docs");

function getShallowDirs() {
  return readdirSync(docsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.name.startsWith(".") &&
        entry.name !== "public",
    )
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function buildItems(dir: string): DefaultTheme.SidebarItem[] {
  return readdirSync(join(docsDir, dir), { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".") && entry.name !== "public")
    .sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))
    .flatMap((entry): DefaultTheme.SidebarItem[] => {
      if (entry.isDirectory()) {
        const items = buildItems(`${dir}/${entry.name}`);
        if (items.length === 0) return [];
        return [
          {
            text: entry.name,
            collapsed: true,
            items,
          },
        ];
      }
      if (!entry.name.endsWith(".md") || entry.name === "index.md") return [];
      const name = entry.name.replace(/\.md$/, "");
      return [
        {
          text: name,
          link: `/${dir}/${name}`,
        },
      ];
    });
}

function buildNavItems(shallowDir: string): DefaultTheme.NavItemWithLink[] {
  return readdirSync(join(docsDir, shallowDir))
    .filter((fileName) => fileName.endsWith(".md") && fileName !== "index.md")
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const name = fileName.replace(/\.md$/, "");
      return {
        text: name,
        link: `/${shallowDir}/${name}`,
      };
    });
}

function buildSidebar(): DefaultTheme.Sidebar {
  const shallowDirs = getShallowDirs();
  return Object.fromEntries(
    shallowDirs.map((dir) => [
      `/${dir}/`,
      [{ text: dir, items: buildItems(dir) }],
    ]),
  );
}

function buildNav(): DefaultTheme.NavItem[] {
  const shallowDirs = getShallowDirs();
  return [
    { text: "homepage", link: "/" },
    ...shallowDirs.map((dir) => ({
      text: dir,
      items: buildNavItems(dir),
      activeMatch: `^/${dir}/`,
    })),
  ];
}

const plugins: PluginOption[] = [
  tailwindcss(),
  VitePWA({
    registerType: "autoUpdate",
    includeAssets: [
      "favicon.svg",
      "favicon.ico",
      "apple-touch-icon-180x180.png",
    ],
    manifest: {
      id: "/h/",
      name: "Swifty Homepage",
      short_name: "Swifty Homepage",
      description: "Swifty Homepage",
      theme_color: "#f05138",
      background_color: "#f05138",
      display: "standalone",
      scope: "/h/",
      start_url: "/h/",
      icons: [
        {
          src: "pwa-64x64.png",
          sizes: "64x64",
          type: "image/png",
        },
        {
          src: "pwa-192x192.png",
          sizes: "192x192",
          type: "image/png",
        },
        {
          src: "pwa-512x512.png",
          sizes: "512x512",
          type: "image/png",
        },
        {
          src: "maskable-icon-512x512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    workbox: {
      globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
      runtimeCaching: [
        {
          urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "google-fonts-cache",
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
          handler: "CacheFirst",
          options: {
            cacheName: "gstatic-fonts-cache",
            expiration: {
              maxEntries: 10,
              maxAgeSeconds: 60 * 60 * 24 * 365,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
      ],
    },
  }),
];

export default defineConfig({
  srcDir: "docs",
  lang: "zh-CN",
  title: "Swifty Homepage",
  description: "Swifty Homepage",
  base: "/h/",
  vite: {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    plugins,
  },
  cleanUrls: true,
  ignoreDeadLinks: false,
  head: [
    // Auto generated
    // <meta charset="UTF-8" />
    // ["meta", { charset: "UTF-8" }],
    // <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    // ["meta", { name: "viewport", content: "width=device-width, initial-scale=1.0" }],
    // <meta name="color-scheme" content="light" />
    // ["meta", { name: "color-scheme", content: "light" }],
    // <meta name="description" content="Swifty Homepage" />
    // ["meta", { name: "description", content: "Swifty Homepage" }],

    ["meta", { name: "theme-color", content: "#f05138" }],
    // <link rel="icon" href="/h/favicon.svg" type="image/svg+xml" />
    [
      "link",
      { rel: "icon", href: "/h/favicon.svg", type: "image/svg+xml" },
    ],
    // <link rel="icon" href="/h/favicon.ico" sizes="48x48" />
    ["link", { rel: "icon", href: "/h/favicon.ico", sizes: "48x48" }],
    // <link rel="apple-touch-icon" href="/h/apple-touch-icon-180x180.png" />
    [
      "link",
      { rel: "apple-touch-icon", href: "/h/apple-touch-icon-180x180.png" },
    ],
  ],
  markdown: {
    lineNumbers: true,
    config(md) {
      const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules);
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        if (token.info.trim() === "mermaid") {
          const graph = encodeURIComponent(token.content);
          return `
<Suspense>
  <template #default>
    <Mermaid id="mermaid-${idx}" graph="${graph}" />
  </template>
  <template #fallback>
    Mermaid Loading...
  </template>
</Suspense>
`;
        }

        return defaultFence
          ? defaultFence(tokens, idx, options, env, self)
          : self.renderToken(tokens, idx, options);
      };
    },
  },
  themeConfig: {
    logo: "/favicon.svg",
    nav: buildNav(),
    sidebar: buildSidebar(),
    outline: [2, 3],
    socialLinks: [{ icon: "github", link: "https://github.com/hangtiancheng" }],
    search: {
      provider: "local",
    },
    editLink: {
      pattern: "https://github.com/hangtiancheng/h/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
  sitemap: {
    hostname: "https://hangtiancheng.github.io/h",
  },
  lastUpdated: true,
});
