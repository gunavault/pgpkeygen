import type { NextConfig } from "next";

// The Dockerfile sets NEXT_OUTPUT=standalone to get a self-contained server in
// .next/standalone. Left unset, `pnpm build && pnpm start` behaves as before.
const standalone = process.env.NEXT_OUTPUT === "standalone";

const nextConfig: NextConfig = {
  ...(standalone
    ? {
        output: "standalone",
        // scripts/migrate.mjs runs inside the image and imports drizzle-orm at
        // runtime. The app's own copy is bundled into the server chunks, so
        // without this the standalone output has no resolvable drizzle-orm at all.
        outputFileTracingIncludes: {
          "/*": ["./node_modules/drizzle-orm/package.json", "./node_modules/drizzle-orm/**/*.js"],
        },
      }
    : {}),
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
