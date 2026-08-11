import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  distDir:
    process.env.NEXT_DIST_DIR ||
    (process.env.NODE_ENV === "development" ? ".next-dev" : ".next"),
  reactStrictMode: true,
  transpilePackages: ["@jiayi/contracts"],
  outputFileTracingRoot: path.join(__dirname),
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
