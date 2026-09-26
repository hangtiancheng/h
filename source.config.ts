import { defineConfig } from "fumadocs-mdx/config";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins/rehype-code";
import { remarkMdxMermaid } from "fumadocs-core/mdx-plugins/remark-mdx-mermaid";

export default defineConfig({
  mdxOptions: {
    // turn ```mermaid fences into <Mermaid chart="..." /> (rendered client-side)
    remarkPlugins: [remarkMdxMermaid],
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      // rspress had `markdown.showLineNumbers: true`; keep line numbers on
      // every code block by extending the default meta parser
      parseMetaString(meta, node, tree) {
        const data =
          rehypeCodeDefaultOptions.parseMetaString?.(meta, node, tree) ?? {};
        data["data-line-numbers"] = true;
        return data;
      },
    },
  },
});
