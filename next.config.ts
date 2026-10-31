import type { NextConfig } from "next";

// cacheComponents/partialPrefetching are intentionally off: every KopiPass page is
// authenticated and tenant-scoped, so pages render per request.
const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "pdf-lib", "unpdf"],
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
