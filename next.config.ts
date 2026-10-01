import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
  devIndicators: false,
};

export default nextConfig;
