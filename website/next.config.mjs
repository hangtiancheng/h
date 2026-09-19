import { createMDX } from "fumadocs-mdx/next";

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  // GitHub Pages static hosting under /h/
  output: "export",
  basePath: "/h",
  images: {
    unoptimized: true,
  },
};

export default createMDX()(config);
