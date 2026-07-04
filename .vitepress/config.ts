import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type DefaultTheme } from "vitepress";
import tailwindcss from "@tailwindcss/vite";
// import { VitePWA } from "vite-plugin-pwa";
import type { PluginOption } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));
const docsDir = join(rootDir, "../docs");

const dictionary: Record<string, string> = {
  mysql: "MySQL",
  redis: "Redis",
  agent: "Agent",
  css: "CSS",
  go: "Go",
  js: "JavaScript",
  linux: "Linux",
  network: "Network",
  next: "Next.js",
  pinia: "Pinia",
  ["react-router"]: "React Router",
  react: "React",
  vite: "Vite",
  vitest: "Vitest",
  ["vue-router"]: "Vue Router",
  vue3: "Vue3",
  zustand: "Zustand",
};

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

function buildItems(shallowDir: string): DefaultTheme.SidebarItem[] {
  return readdirSync(join(docsDir, shallowDir))
    .filter((fileName) => fileName.endsWith(".md") && fileName !== "index.md")
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const fileNameNoExt = fileName.replace(/\.md$/, "");
      const relativePath = `${shallowDir}/${fileNameNoExt}`;
      return {
        text: dictionary[fileNameNoExt] || fileNameNoExt,
        link: `/${relativePath}`,
      };
    });
}

function buildNavItems(shallowDir: string): DefaultTheme.NavItemWithLink[] {
  return readdirSync(join(docsDir, shallowDir))
    .filter((fileName) => fileName.endsWith(".md") && fileName !== "index.md")
    .sort((a, b) => a.localeCompare(b))
    .map((fileName) => {
      const name = fileName.replace(/\.md$/, "");
      return {
        text: dictionary[name] || name,
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

const base = "/h/";

const plugins: PluginOption[] = [
  tailwindcss(),
  // VitePWA({
  //   registerType: "autoUpdate",
  //   includeAssets: [
  //     "favicon.svg",
  //     "favicon.ico",
  //     "apple-touch-icon-180x180.png",
  //   ],
  //   manifest: {
  //     name: "homepage",
  //     short_name: "homepage",
  //     description: "homepage",
  //     theme_color: "#ecfdf5",
  //     background_color: "#ecfdf5",
  //     display: "standalone",
  //     scope: base,
  //     start_url: base,
  //     icons: [
  //       {
  //         src: "pwa-64x64.png",
  //         sizes: "64x64",
  //         type: "image/png",
  //       },
  //       {
  //         src: "pwa-192x192.png",
  //         sizes: "192x192",
  //         type: "image/png",
  //       },
  //       {
  //         src: "pwa-512x512.png",
  //         sizes: "512x512",
  //         type: "image/png",
  //       },
  //       {
  //         src: "maskable-icon-512x512.png",
  //         sizes: "512x512",
  //         type: "image/png",
  //         purpose: "maskable",
  //       },
  //     ],
  //   },
  //   workbox: {
  //     globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
  //     runtimeCaching: [
  //       {
  //         urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
  //         handler: "CacheFirst",
  //         options: {
  //           cacheName: "google-fonts-cache",
  //           expiration: {
  //             maxEntries: 10,
  //             maxAgeSeconds: 60 * 60 * 24 * 365,
  //           },
  //           cacheableResponse: { statuses: [0, 200] },
  //         },
  //       },
  //       {
  //         urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
  //         handler: "CacheFirst",
  //         options: {
  //           cacheName: "gstatic-fonts-cache",
  //           expiration: {
  //             maxEntries: 10,
  //             maxAgeSeconds: 60 * 60 * 24 * 365,
  //           },
  //           cacheableResponse: { statuses: [0, 200] },
  //         },
  //       },
  //     ],
  //   },
  // }),
];

export default defineConfig({
  srcDir: "docs",
  lang: "zh-CN",
  title: "homepage",
  description: "homepage",
  base,
  vite: {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    plugins,
  },
  cleanUrls: true,
  ignoreDeadLinks: false,
  head: [
    [
      "link",
      { rel: "icon", href: `${base}favicon.svg`, type: "image/svg+xml" },
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
