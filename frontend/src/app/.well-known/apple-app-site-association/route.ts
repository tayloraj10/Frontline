import { NextResponse } from "next/server";

// iOS Universal Links verification. See NativeAppBridge.tsx and login/page.tsx
// for why this is needed: it's what lets the OS hand the OAuth redirect back
// to the app instead of leaving it in Safari.
export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "4PF46V9GR7.com.frontline.app",
          paths: ["/auth/callback", "/auth/callback/*"],
        },
      ],
    },
  });
}
