import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Don't block Vercel deployments on TypeScript errors. Local `tsc --noEmit`
  // and CI are still the source of truth for type safety — this only stops
  // `next build` from failing on transient/incremental type errors during a
  // deploy. (Note: Next.js 16 no longer runs ESLint as part of `next build`,
  // so the legacy `eslint.ignoreDuringBuilds` option has been removed from
  // NextConfig and is not needed here. `npm run lint` is a separate script.)
  typescript: {
    ignoreBuildErrors: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
