import type { Metadata, Viewport } from "next";
import { TreeContextProvider } from "@fumadocs/base-ui/contexts/tree";
import { NextProvider } from "fumadocs-core/framework/next";
import { Provider } from "@/components/provider";
import { appName, basePath, mountUrl, siteDescription } from "@/lib/shared";
import { source } from "@/lib/source";
import "./global.css";

export const metadata: Metadata = {
  metadataBase: new URL(mountUrl),
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
  description: "knowledge base covering agent, frontend, and backend.",
  icons: {
    icon: `${basePath}/favicon.svg`,
  },
  openGraph: {
    title: appName,
    description: siteDescription,
    url: mountUrl,
    siteName: appName,
    type: "website",
    locale: "zh_CN",
  },
};

export const viewport: Viewport = {
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
