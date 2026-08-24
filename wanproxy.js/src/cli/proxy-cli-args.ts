import { z } from "zod";

export const ProxyCliArgsSchema = z.object({
  configPath: z.string().min(1),
});

export type ProxyCliArgs = z.infer<typeof ProxyCliArgsSchema>;

export function parseProxyCliArgs(argv: readonly string[]): ProxyCliArgs {
  const positional = argv.slice(2);
  const first = positional.at(0);
  const second = positional.at(1);

  if (positional.length === 1 && first !== undefined) {
    return ProxyCliArgsSchema.parse({ configPath: first });
  }

  if (positional.length === 2 && first === "--config" && second !== undefined) {
    return ProxyCliArgsSchema.parse({ configPath: second });
  }

  throw new Error(
    "usage: wanproxy-js <config.json> or wanproxy-js --config <config.json>",
  );
}
