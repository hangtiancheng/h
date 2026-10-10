import { defineConfig } from "fumadocs-mdx/config";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins/rehype-code";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins/remark-mdx-mermaid";

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMdxMermaid],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      parseMetaString(meta, node, tree) {
        const data =
          rehypeCodeDefaultOptions.parseMetaString?.(meta, node, tree) ?? {};
        data["data-line-numbers"] = true;
        return data;
      },
    },
  },
});
