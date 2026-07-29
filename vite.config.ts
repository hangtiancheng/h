import { resolve } from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";

export default defineConfig({
  root: resolve(import.meta.dirname, "app"),
  base: "/h/swifty-docs/",
  plugins: [
    swiftyDocsPlugin({ config: docsConfig }),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      includeAssets: [
        "favicon.svg",
        "favicon.ico",
        "apple-touch-icon-180x180.png",
      ],
      manifest: {
        id: "/h/swifty-docs/",
        name: "homepage",
        short_name: "homepage",
        description: "homepage",
        theme_color: "#f05138",
        background_color: "#f05138",
        display: "standalone",
        scope: "/h/swifty-docs/",
        start_url: "/h/swifty-docs/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
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
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@swifty-docs/generated": resolve(
        import.meta.dirname,
        ".swifty-docs/generated",
      ),
    },
  },
  build: {
    outDir: resolve(import.meta.dirname, "dist-swifty"),
    emptyOutDir: true,
  },
});
