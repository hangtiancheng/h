import { resolve } from "node:path";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { swiftyDocsPlugin } from "@swifty.js/docs/vite";
import docsConfig from "./swifty-docs.config";

export default defineConfig({
  root: resolve(import.meta.dirname, "app"),
  base: "/h/",
  plugins: [swiftyDocsPlugin({ config: docsConfig }), tailwindcss()],
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
