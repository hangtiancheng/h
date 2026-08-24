import { defineConfig } from "tsup";

export default defineConfig({
  clean: true,
  dts: {
    compilerOptions: {
      declarationMap: false,
    },
  },
  entry: {
    "cli/index": "src/cli/index.ts",
    "demo/echo-server": "src/demo/echo-server.ts",
    "demo/socks5-client": "src/demo/socks5-client.ts",
    "demo/tcp-client": "src/demo/tcp-client.ts",
    index: "src/index.ts",
  },
  external: ["zod"],
  format: ["esm", "cjs"],
  outExtension: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".js",
  }),
  outDir: "dist-tsup",
  platform: "node",
  sourcemap: false,
  splitting: true,
  target: "node20",
  tsconfig: "tsconfig.json",
});
