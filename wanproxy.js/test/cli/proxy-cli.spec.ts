import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { formatProxyCliError, startConfiguredProxy } from "@/cli/proxy-cli.js";
import { parseProxyCliArgs } from "@/cli/proxy-cli-args.js";

describe("proxy CLI", () => {
  it("parses positional and named config paths", () => {
    expect(parseProxyCliArgs(["node", "cli", "proxy.json"])).toEqual({
      configPath: "proxy.json",
    });
    expect(
      parseProxyCliArgs(["node", "cli", "--config", "proxy.json"]),
    ).toEqual({
      configPath: "proxy.json",
    });
    expect(() => parseProxyCliArgs(["node", "cli"])).toThrow("usage:");
  });

  it("formats CLI errors without assuming thrown value shape", () => {
    expect(formatProxyCliError(new Error("bad config"))).toBe("bad config");
    expect(formatProxyCliError("bad config")).toBe("unknown proxy CLI error");
  });

  it("starts configured proxies from a JSON file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "wanproxy-js-"));
    const configPath = join(directory, "proxy.json");
    await writeFile(
      configPath,
      JSON.stringify({
        proxies: [
          {
            listen: { host: "127.0.0.1", port: 0 },
            name: "cli-proxy",
            upstream: { host: "127.0.0.1", port: 1 },
          },
        ],
        monitor: { listen: { host: "127.0.0.1", port: 0 } },
      }),
    );

    const output = new PassThrough();
    const chunks: Buffer[] = [];
    output.on("data", (chunk: Buffer) => chunks.push(chunk));

    const fleet = await startConfiguredProxy(
      ["node", "cli", configPath],
      output,
    );
    try {
      expect(fleet.addresses()).toHaveLength(1);
      const text = Buffer.concat(chunks).toString("utf8");
      expect(text).toContain("proxy listening on 127.0.0.1:");
      expect(text).toContain("monitor listening on 127.0.0.1:");
    } finally {
      await fleet.stop();
      await rm(directory, { force: true, recursive: true });
    }
  });
});
