import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// scripts/dev.mjs sets CAP_DEV_SERVER to the host's LAN IP; reuse it here so the
// emulator/device origin doesn't have to be hardcoded twice.
const devServerHost = process.env.CAP_DEV_SERVER ? new URL(process.env.CAP_DEV_SERVER).hostname : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "pub-*.r2.dev",
      },
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/**",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
  },
  compress: true,
  // Old Rewards URLs (emails, Stripe return links, shipped mobile builds) keep working. Temporary (307)
  // on purpose: the Fund tab name is still a placeholder, so browsers must not cache these forever.
  async redirects() {
    return [
      { source: "/marketplace/board", destination: "/earn?do=jobs", permanent: false },
      { source: "/marketplace/become-a-cleaner", destination: "/earn/profile", permanent: false },
      { source: "/sponsorships/pools/:path*", destination: "/fund/pools/:path*", permanent: false },
      { source: "/sponsorships", destination: "/earn", permanent: false },
      { source: "/marketplace", destination: "/fund", permanent: false },
      { source: "/marketplace/:path+", destination: "/fund/:path+", permanent: false },
    ];
  },
  experimental: {
    optimizePackageImports: ["maplibre-gl", "gsap"],
  },
  // Next.js blocks cross-origin dev-server requests (including the HMR websocket) from anything
  // but localhost. Testing against the Android emulator/a physical device requires loading the
  // page from the host's LAN IP, so it must be allow-listed here too.
  allowedDevOrigins: devServerHost ? [devServerHost] : undefined,
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  sourcemaps: { disable: process.env.NODE_ENV !== "production" },
  disableLogger: true,
  automaticVercelMonitors: true,
});
