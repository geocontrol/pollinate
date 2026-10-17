import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@pollinate/engine", "@pollinate/db", "@pollinate/auth"],
  poweredByHeader: false,
};

export default nextConfig;
