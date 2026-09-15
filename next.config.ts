import type { NextConfig } from "next";

// The Dockerfile sets NEXT_OUTPUT=standalone to get a self-contained server in
// .next/standalone. Left unset, `pnpm build && pnpm start` behaves as before.
const standalone = process.env.NEXT_OUTPUT === "standalone";
const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "media-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

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
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
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
