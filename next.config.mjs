import { createMDX } from "fumadocs-mdx/next";

const config = {
  reactStrictMode: true,
  output: "export",
  basePath: "/h",
  images: {
    unoptimized: true,
  },
};

export default createMDX()(config);
