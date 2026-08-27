import {
  buildNav,
  buildSidebar,
  installMermaidFence,
  MERMAID_TAG,
} from "@lark.js/docs";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitepress";
import { excludePrivatePages, privateDocsPlugin } from "@swifty.js/docs";

export default defineConfig({
  srcDir: "docs",
  lang: "zh-CN",
  title: "Swifty Homepage",
  description: "Swifty Homepage",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,
  base: "/h/",
  vite: {
    plugins: [
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "script",
        includeAssets: [
          "favicon.svg",
          "favicon.ico",
          "apple-touch-icon-180x180.png",
        ],
        manifest: {
          id: "/h/",
          name: "homepage",
          short_name: "homepage",
          description: "homepage",
          theme_color: "#f05138",
          background_color: "#f05138",
          display: "standalone",
          scope: "/h/",
          start_url: "/h/",
          icons: [
            {
              src: "/h/pwa-64x64.png",
              sizes: "64x64",
              type: "image/png",
            },
            {
              src: "/h/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/h/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/h/maskable-icon-512x512.png",
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
      privateDocsPlugin(),
    ],
    optimizeDeps: {
      exclude: ["@swifty.js/anti-copy", "@lark.js/docs"],
      // Prebundle the excluded package's nested dep so its CJS deps (dayjs) get ESM interop in dev.
      include: ["@lark.js/docs > mermaid"],
    },
    ssr: {
      noExternal: ["@swifty.js/anti-copy", "@lark.js/docs"],
    },
  },
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
    ["link", { rel: "icon", href: "/h/favicon.svg", type: "image/svg+xml" }],
    // <link rel="icon" href="/h/favicon.ico" sizes="48x48" />
    ["link", { rel: "icon", href: "/h/favicon.ico", sizes: "48x48" }],
    // <link rel="apple-touch-icon" href="/h/apple-touch-icon-180x180.png" />
    [
      "link",
      { rel: "apple-touch-icon", href: "/h/apple-touch-icon-180x180.png" },
    ],
    // <link rel="manifest" href="/h/manifest.webmanifest" />
    ["link", { rel: "manifest", href: "/h/manifest.webmanifest" }],
    // <script id="vite-plugin-pwa:register-sw" src="/h/registerSW.js"></script>
    [
      "script",
      {
        id: "vite-plugin-pwa:register-sw",
        src: "/h/registerSW.js",
      },
    ],
  ],
  markdown: {
    lineNumbers: true,
    config: installMermaidFence,
  },
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag === MERMAID_TAG,
      },
    },
  },
  themeConfig: {
    nav: buildNav("docs"),
    sidebar: buildSidebar("docs"),
    logo: "/favicon.svg",
    outline: { level: [2, 3] },
    socialLinks: [{ icon: "github", link: "https://github.com/hangtiancheng" }],
    search: {
      provider: "local",
      // Local search reads markdown straight from disk, so private pages
      // must be excluded explicitly. Mirrors the default renderer and
      // keeps `search: false` support.
      options: { _render: excludePrivatePages },
    },
    editLink: {
      pattern: "https://github.com/hangtiancheng/h/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
  sitemap: {
    hostname: "https://hangtiancheng.github.io/h",
  },
});
