import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    dir: fileURLToPath(new URL("./test", import.meta.url)),
  },
});
