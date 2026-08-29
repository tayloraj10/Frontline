import { NextResponse } from "next/server";

// iOS Universal Links verification. See NativeAppBridge.tsx and login/page.tsx
// for why this is needed: it's what lets the OS hand any frontlinemaps.com link
// (OAuth redirect, shared route/campaign/group links, push-notification taps,
// etc.) to the app instead of leaving it in Safari. NativeAppBridge's
// appUrlOpen listener already accepts any frontlinemaps.com URL, so every path
// is eligible here too — "*" keeps the two in sync without needing a matching
// edit every time a new shareable path is added.
export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "4PF46V9GR7.com.frontlinemaps.app",
          paths: ["*"],
        },
      ],
    },
  });
}
