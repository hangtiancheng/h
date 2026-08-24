import { readFile } from "node:fs/promises";

import { parseWanproxyConfig, type WanproxyConfig } from "./proxy-config.js";

export async function loadWanproxyConfig(
  path: string,
): Promise<WanproxyConfig> {
  const raw = await readFile(path, "utf8");
  return parseWanproxyConfig(JSON.parse(raw));
}
