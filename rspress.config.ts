import path from "node:path";
import { defineConfig } from "@rspress/core";
import { pluginSitemap } from "@rspress/plugin-sitemap";
import { pluginPWA } from "rsbuild-plugin-pwa";

export default defineConfig({
  root: "docs",
  base: "/h/",
  lang: "zh",
  title: "Swifty Homepage",
  description: "Swifty Homepage",
  icon: "/favicon.svg",
  logo: "/favicon.svg",
  globalStyles: path.join(process.cwd(), "theme/global.css"),
  markdown: {
    showLineNumbers: true,
  },
  themeConfig: {
    nav: [
      { text: "homepage", link: "/" },
      {
        text: "base",
        link: "/base/css",
        activeMatch: "^/base/",
        items: [
          { text: "css", link: "/base/css" },
          { text: "git", link: "/base/git" },
          { text: "go", link: "/base/go" },
          { text: "js", link: "/base/js" },
          { text: "linux", link: "/base/linux" },
          { text: "network", link: "/base/network" },
        ],
      },
      {
        text: "backend",
        link: "/backend/mysql",
        activeMatch: "^/backend/",
        items: [
          { text: "mysql", link: "/backend/mysql" },
          { text: "redis", link: "/backend/redis" },
        ],
      },
      {
        text: "frontend",
        link: "/frontend/lit",
        activeMatch: "^/frontend/",
        items: [
          { text: "lit", link: "/frontend/lit" },
          { text: "next", link: "/frontend/next" },
          { text: "pinia", link: "/frontend/pinia" },
          { text: "react", link: "/frontend/react" },
          { text: "react-router", link: "/frontend/react-router" },
          { text: "rsc", link: "/frontend/rsc" },
          { text: "sentry", link: "/frontend/sentry" },
          { text: "vite", link: "/frontend/vite" },
          { text: "vitest", link: "/frontend/vitest" },
          { text: "vue-router", link: "/frontend/vue-router" },
          { text: "vue3", link: "/frontend/vue3" },
          { text: "zustand", link: "/frontend/zustand" },
        ],
      },
      {
        text: "qa",
        link: "/qa/2607",
        activeMatch: "^/qa/",
        items: [{ text: "2607", link: "/qa/2607" }],
      },
    ],
    lastUpdated: true,
    search: true,
    socialLinks: [
      {
        icon: "github",
        mode: "link",
        content: "https://github.com/hangtiancheng",
      },
    ],
    editLink: {
      docRepoBaseUrl: "https://github.com/hangtiancheng/h/edit/main/docs",
    },
  },
  plugins: [pluginSitemap({ siteUrl: "https://hangtiancheng.github.io/h" })],
  builderConfig: {
    plugins: [
      pluginPWA({
        htmlTags: {
          themeColor: "#f05138",
          icon: [{ href: "/h/favicon.ico", sizes: "48x48" }],
          appleTouchIcon: { href: "/h/apple-touch-icon-180x180.png" },
        },
        registerSw: {
          type: "script",
          features: {
            autoSkipWaiting: true,
            autoReloadPage: true,
          },
        },
        webAppManifest: {
          content: {
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
        },
        sw: {
          mode: "generateSw",
          workboxOptions: {
            skipWaiting: true,
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
        },
      }),
    ],
  },
});
