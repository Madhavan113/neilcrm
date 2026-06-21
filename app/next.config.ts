import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app — there are stray lockfiles in parent
  // directories that Next would otherwise infer as the root.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
