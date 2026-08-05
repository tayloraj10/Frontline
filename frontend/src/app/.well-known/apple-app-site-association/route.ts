import { NextResponse } from "next/server";

// iOS Universal Links verification. TODO: replace PLACEHOLDER_TEAM_ID with the
// real Apple Developer Team ID once the app's developer account is finalized
// (see project_capacitor_scoping memory — personal vs. LLC/nonprofit account
// still undecided). See NativeAppBridge.tsx and login/page.tsx for why this is
// needed: it's what lets the OS hand the OAuth redirect back to the app instead
// of leaving it in Safari.
export async function GET() {
  return NextResponse.json({
    applinks: {
      apps: [],
      details: [
        {
          appID: "PLACEHOLDER_TEAM_ID.com.frontline.app",
          paths: ["/auth/callback", "/auth/callback/*"],
        },
      ],
    },
  });
}
