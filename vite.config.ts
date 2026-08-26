import { resolve } from "node:path";
import { defineConfig, type PluginOption, type Plugin } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import {
  swiftyDocsPlugin,
  docsGuardPlugin as swiftyDocsGuardPlugin,
} from "@swifty.js/docs/vite";
import docsConfig from "./docs.config.js";
import { parse } from "node-html-parser";

type ResourceType =
  "script" | "stylesheet" | "font" | "image" | "preload" | "modulepreload";

interface PriorityHintsOptions {
  priorities?: Partial<Record<ResourceType, "high" | "low" | "auto">>;
  preconnect?: string[];
  dnsPrefetch?: string[];
  firstImageCount?: number;
}

const DEFAULT_OPTIONS: Required<
  Pick<PriorityHintsOptions, "priorities" | "firstImageCount">
> &
  PriorityHintsOptions = {
  priorities: {
    script: "high" as const,
    stylesheet: "high" as const,
    font: "high" as const,
    modulepreload: "low" as const,
  },
  preconnect: [],
  dnsPrefetch: [],
  firstImageCount: 1,
};

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function priorityHintsPlugin(options: PriorityHintsOptions = {}): Plugin {
  const opts = {
    ...DEFAULT_OPTIONS,
    ...options,
    priorities: { ...DEFAULT_OPTIONS.priorities, ...options.priorities },
  };

  return {
    name: "priority-hints",
    enforce: "post",
    transformIndexHtml(html) {
      // { comment: true } keeps HTML comments; node-html-parser drops them by default
      const root = parse(html, { comment: true });

      const applyPriority = (selector: string, priority?: string) => {
        if (!priority) return;
        for (const el of root.querySelectorAll(selector)) {
          el.setAttribute("fetchpriority", priority);
        }
      };

      applyPriority("script[type=module]", opts.priorities.script);
      applyPriority('link[rel="stylesheet"]', opts.priorities.stylesheet);
      applyPriority('link[rel="modulepreload"]', opts.priorities.modulepreload);
      applyPriority('link[rel="preload"][as="font"]', opts.priorities.font);
      applyPriority(
        'link[rel="preload"]:not([as="font"])',
        opts.priorities.preload,
      );

      root.querySelectorAll("img").forEach((el, i) => {
        const aboveFold = i < opts.firstImageCount;
        // only fill in missing attributes so hand-written hints are preserved
        if (!el.hasAttribute("fetchpriority")) {
          el.setAttribute(
            "fetchpriority",
            aboveFold ? (opts.priorities.image ?? "high") : "low",
          );
        }
        if (!el.hasAttribute("loading")) {
          el.setAttribute("loading", aboveFold ? "eager" : "lazy");
        }
      });

      const head = root.querySelector("head");
      if (head) {
        const preconnectHrefs = new Set(
          head
            .querySelectorAll('link[rel="preconnect"]')
            .map((el) => el.getAttribute("href"))
            .filter((href): href is string => href !== undefined),
        );
        const dnsPrefetchHrefs = new Set(
          head
            .querySelectorAll('link[rel="dns-prefetch"]')
            .map((el) => el.getAttribute("href"))
            .filter((href): href is string => href !== undefined),
        );
        const hints: string[] = [];
        for (const origin of opts.preconnect ?? []) {
          if (preconnectHrefs.has(origin)) continue;
          preconnectHrefs.add(origin);
          // preconnect subsumes dns-prefetch for the same origin
          dnsPrefetchHrefs.add(origin);
          hints.push(
            `<link rel="preconnect" href="${escapeAttr(origin)}" crossorigin>`,
          );
        }
        for (const origin of opts.dnsPrefetch ?? []) {
          if (dnsPrefetchHrefs.has(origin)) continue;
          dnsPrefetchHrefs.add(origin);
          hints.push(`<link rel="dns-prefetch" href="${escapeAttr(origin)}">`);
        }
        if (hints.length > 0) {
          // insert after <meta charset> so the charset declaration stays first
          const charset = head.querySelector("meta[charset]");
          if (charset) {
            charset.insertAdjacentHTML("afterend", hints.join(""));
          } else {
            head.insertAdjacentHTML("afterbegin", hints.join(""));
          }
        }
      }

      return root.toString();
    },
  };
}
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
      swiftyDocsPlugin({ config: docsConfig }),
      ...(command === "build" ? [swiftyDocsGuardPlugin()] : []),
      tailwindcss(),
      priorityHintsPlugin(),
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
