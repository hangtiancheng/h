"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronDown } from "lucide-react";
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogFooter,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps,
} from "@fumadocs/base-ui/components/dialog/search";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@fumadocs/base-ui/components/ui/popover";
import { buttonVariants } from "@fumadocs/base-ui/components/ui/button";
import { useTreeContext } from "@fumadocs/base-ui/contexts/tree";
import { useDocsSearch } from "fumadocs-core/search/client";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import type { Item, Node } from "fumadocs-core/page-tree";
import { cn } from "@/lib/cn";

const items = [
  {
    name: "all",
    value: undefined,
  },
  {
    name: "base",
    value: "base",
  },
  {
    name: "frontend",
    value: "frontend",
  },
  {
    name: "backend",
    value: "backend",
  },
];

export default function CustomSearchDialog(props: SharedProps) {
  const [open, setOpen] = useState(false);
  const [tag, setTag] = useState<string | undefined>();
  const { search, setSearch, query } = useDocsSearch({
    client: staticClient({
      // static export: the search index is a build-time JSON file served
      // under the GitHub Pages basePath
      from: "/h/api/search",
      tag,
    }),
  });
  const { full } = useTreeContext();
  const router = useRouter();
  const searchMap = useMemo(() => {
    const map = new Map<string, Item>();

    function onNode(node: Node) {
      if (node.type === "page" && typeof node.name === "string") {
        map.set(node.name.toLowerCase(), node);
      } else if (node.type === "folder") {
        if (node.index) onNode(node.index);
        for (const item of node.children) onNode(item);
      }
    }

    for (const item of full.children) onNode(item);
    return map;
  }, [full]);
  // quick action: jump to a page whose title starts with the query
  const pageTreeAction = useMemo<SearchItemType | undefined>(() => {
    if (search.length === 0) return;

    const normalized = search.toLowerCase();
    for (const [k, page] of searchMap) {
      if (!k.startsWith(normalized)) continue;

      return {
        id: "quick-action",
        type: "action",
        node: (
          <div className="inline-flex items-center gap-2 text-fd-muted-foreground">
            <ArrowRight className="size-4" />
            <p>
              Jump to{" "}
              <span className="font-medium text-fd-foreground">
                {page.name}
              </span>
            </p>
          </div>
        ),
        onSelect: () => router.push(page.url),
      };
    }
  }, [router, search, searchMap]);

  return (
    <SearchDialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList
          items={
            query.data !== "empty" || pageTreeAction
              ? [
                  ...(pageTreeAction ? [pageTreeAction] : []),
                  ...(Array.isArray(query.data) ? query.data : []),
                ]
              : null
          }
        />
        <SearchDialogFooter className="flex flex-row flex-wrap gap-2 items-center">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className={buttonVariants({
                size: "sm",
                variant: "ghost",
                className: "-m-1.5 me-auto",
              })}
            >
              <span className="text-fd-muted-foreground/80 me-2">Filter</span>
              {items.find((item) => item.value === tag)?.name}
              <ChevronDown className="size-3.5 text-fd-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="flex flex-col p-1 gap-1" align="start">
              {items.map((item, i) => {
                const isSelected = item.value === tag;

                return (
                  <button
                    key={i}
                    onClick={() => {
                      setTag(item.value);
                      setOpen(false);
                    }}
                    className={cn(
                      "rounded-lg text-start px-2 py-1.5",
                      isSelected
                        ? "text-fd-primary bg-fd-primary/10"
                        : "hover:text-fd-accent-foreground hover:bg-fd-accent",
                    )}
                  >
                    <p className="font-medium">{item.name}</p>
                  </button>
                );
              })}
            </PopoverContent>
          </Popover>
        </SearchDialogFooter>
      </SearchDialogContent>
    </SearchDialog>
  );
}
