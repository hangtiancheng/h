import type { Metadata, Viewport } from "next";
import { TreeContextProvider } from "@fumadocs/base-ui/contexts/tree";
import { NextProvider } from "fumadocs-core/framework/next";
import { Provider } from "@/components/provider";
import { source } from "@/lib/source";
import "./global.css";

export const metadata: Metadata = {
  title: {
    default: "Yukino Homepage",
    template: "%s | Yukino Homepage",
  },
  description: "knowledge base covering agent, frontend, and backend.",
  icons: {
    // favicon URLs are not resolved against basePath, so carry /h manually
    icon: "/h/favicon.svg",
  },
};

export const viewport: Viewport = {
  // match the neutral.css page backgrounds (light 96% / dark 7%)
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f5" },
  ],
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="relative flex min-h-screen flex-col">
        <NextProvider>
          <TreeContextProvider tree={source.getPageTree()}>
            <Provider>{children}</Provider>
          </TreeContextProvider>
        </NextProvider>
      </body>
    </html>
  );
}
