import type * as PageTree from "fumadocs-core/page-tree";
import { absolutePageUrl, appName, siteDescription } from "@/lib/shared";
import { source } from "@/lib/source";

export const revalidate = false;

const pagesByUrl = new Map(source.getPages().map((page) => [page.url, page]));

function renderNodes(nodes: PageTree.Node[], lines: string[]): void {
  for (const node of nodes) {
    if (node.type === "separator") {
      if (typeof node.name === "string" && node.name !== "") {
        lines.push(`**${node.name}**`);
      }
      continue;
    }
    if (node.type === "folder") {
      renderNodes(node.children, lines);
      continue;
    }
    const page = pagesByUrl.get(node.url);
    if (!page) continue;
    const description = page.data.description;
    lines.push(
      `- [${page.data.title}](${absolutePageUrl(page.url)})${description ? `: ${description}` : ""}`,
    );
  }
}

export async function GET() {
  const tree = source.getPageTree();
  const lines: string[] = [`# ${appName}`, "", `> ${siteDescription}`, ""];

  for (const child of tree.children) {
    if (child.type !== "folder") continue;
    const title =
      typeof child.name === "string" && child.name !== ""
        ? child.name
        : (child.index?.url ?? "");
    lines.push(`## ${title}`, "");
    renderNodes(child.children, lines);
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
