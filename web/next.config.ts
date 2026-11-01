import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // No floating dev badge: it overlaps the sidebar and would show up in demo recordings.
  devIndicators: false,
  // Loaded at runtime from node_modules (PGlite ships WASM + data files; pg has optional native bits).
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
