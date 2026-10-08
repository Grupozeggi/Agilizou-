import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O app é quase todo autenticado e por requisição, então usamos a
  // renderização dinâmica clássica (sem cacheComponents).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
};

export default nextConfig;
