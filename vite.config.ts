import { resolve } from "node:path";
import { defineConfig, type PluginOption } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  swiftyDocsPlugin,
  docsGuardPlugin as swiftyDocsGuardPlugin,
} from "@swifty.js/docs/vite";
import swiftyDocsConfig from "./docs.config.js";

function pwaPlugin(base: string): PluginOption {
  return VitePWA({
    registerType: "autoUpdate",
    injectRegister: "script",
    includeAssets: [
      "favicon.svg",
      "favicon.ico",
      "apple-touch-icon-180x180.png",
    ],
    manifest: {
      id: base,
      name: "homepage",
      short_name: "homepage",
      description: "homepage",
      theme_color: "#f05138",
      background_color: "#f05138",
      display: "standalone",
      scope: base,
      start_url: base,
      icons: [
        { src: `${base}pwa-64x64.png`, sizes: "64x64", type: "image/png" },
        { src: `${base}pwa-192x192.png`, sizes: "192x192", type: "image/png" },
        { src: `${base}pwa-512x512.png`, sizes: "512x512", type: "image/png" },
        {
          src: `${base}maskable-icon-512x512.png`,
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
  });
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
export default defineConfig(({ command }) => {
  return {
    root: resolve(import.meta.dirname, "swifty"),
    base: "/h/swifty-docs/",
    publicDir: resolve(import.meta.dirname, "public"),
    plugins: [
      swiftyDocsPlugin({ config: swiftyDocsConfig }),
      ...(command === "build" ? [swiftyDocsGuardPlugin()] : []),
      tailwindcss(),
      pwaPlugin("/h/swifty-docs/"),
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
  };
});
