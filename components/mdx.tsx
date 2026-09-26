import defaultMdxComponents from "@fumadocs/base-ui/mdx";
import { Accordion, Accordions } from "@fumadocs/base-ui/components/accordion";
import { Banner } from "@fumadocs/base-ui/components/banner";
import * as FilesComponents from "@fumadocs/base-ui/components/files";
import { InlineTOC } from "@fumadocs/base-ui/components/inline-toc";
import { Tab, Tabs } from "@fumadocs/base-ui/components/tabs";
import { TypeTable } from "@fumadocs/base-ui/components/type-table";
import type { MDXComponents } from "mdx/types";

import { Mermaid } from "@/components/mermaid";

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    ...FilesComponents,
    Accordion,
    Accordions,
    Banner,
    InlineTOC,
    Mermaid,
    Tabs,
    Tab,
    TypeTable,
    ...components,
  } satisfies MDXComponents;
}

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
