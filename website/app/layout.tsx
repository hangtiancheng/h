import type { Metadata, Viewport } from "next";
import { Provider } from "@/components/provider";
import "./global.css";

export const metadata: Metadata = {
  // resolves relative og:image URLs under the /h basePath
  metadataBase: new URL("https://hangtiancheng.github.io/h"),
  title: {
    default: "Swifty Homepage",
    template: "%s | Swifty Homepage",
  },
  description: "Swifty Homepage",
  icons: {
    // icon URLs bypass metadataBase resolution, prefix /h manually
    icon: "/h/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#849a72",
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
