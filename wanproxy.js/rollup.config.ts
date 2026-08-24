import typescript from "@rollup/plugin-typescript";
import { builtinModules } from "node:module";
import type { RollupOptions } from "rollup";

const entries = {
  index: "src/index.ts",
  "cli/index": "src/cli/index.ts",
  "demo/echo-server": "src/demo/echo-server.ts",
  "demo/socks5-client": "src/demo/socks5-client.ts",
  "demo/tcp-client": "src/demo/tcp-client.ts",
};

const external = new Set([
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`),
  "zod",
]);

const config: RollupOptions = {
  external: (moduleId: string) => external.has(moduleId),
  input: entries,
  output: [
    {
      chunkFileNames: "chunks/[name]-[hash].js",
      dir: "dist-rollup",
      entryFileNames: "[name].js",
      format: "esm",
      sourcemap: false,
    },
    {
      chunkFileNames: "chunks/[name]-[hash].cjs",
      dir: "dist-rollup",
      entryFileNames: "[name].cjs",
      exports: "named",
      format: "cjs",
      sourcemap: false,
    },
  ],
  plugins: [
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-expect-error
    typescript({
      compilerOptions: {
        declaration: true,
        declarationDir: "dist-rollup",
        declarationMap: false,
        outDir: "dist-rollup",
        rootDir: "src",
        sourceMap: false,
      },
      tsconfig: "./tsconfig.json",
    }),
  ],
};

export default config;
