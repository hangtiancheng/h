// source.config.ts
import { defineConfig } from "fumadocs-mdx/config";
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins/rehype-code";
var source_config_default = defineConfig({
  mdxOptions: {
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
export { source_config_default as default };
