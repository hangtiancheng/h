import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

const input = {
  "core/index": "src/core/index.ts",
  "vitepress/index": "src/vitepress/index.ts",
  "swifty-docs/index": "src/swifty-docs/index.ts",
  "rspress/index": "src/rspress/index.ts",
};

const external = [
  /^preact(\/|$)/,
  "preact-iso",
  /^react(\/|$)/,
  /^vue(\/|$)/,
  /^vitepress(\/|$)/,
  /^@rspress\//,
];

export default {
  input,
  external,
  plugins: [typescript({ tsconfig: "./tsconfig.build.json" }), terser()],
  output: [
    {
      dir: "dist",
      format: "es",
      entryFileNames: "[name].js",
      chunkFileNames: "chunks/[name]-[hash].js",
      sourcemap: false,
    },
    {
      dir: "dist",
      format: "cjs",
      entryFileNames: "[name].cjs",
      chunkFileNames: "chunks/[name]-[hash].cjs",
      exports: "named",
      sourcemap: false,
    },
  ],
};
