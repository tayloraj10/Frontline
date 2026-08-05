"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/capacitor";

// Mounted once in the root layout. No-ops entirely on web — everything here
// only matters inside the Capacitor-wrapped iOS/Android build.
export default function NativeAppBridge() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let removeUrlListener: (() => void) | undefined;

    (async () => {
      const [{ App }, { Browser }, { StatusBar, Style }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
        import("@capacitor/status-bar"),
      ]);

      // Google's OAuth screen can't be shown inside the app's embedded WebView
      // (Google blocks embedded user agents), so login opens it in the system
      // browser instead. Once Google/Supabase finish and redirect back to our
      // production callback URL, that redirect arrives here as an app-open
      // event (via Universal Links / App Links) — close the system browser and
      // hand the URL to the main WebView to continue the normal cookie-based
      // session flow.
      const sub = await App.addListener("appUrlOpen", ({ url }) => {
        if (!url.startsWith("https://www.frontlinemaps.com")) return;
        Browser.close().catch(() => {});
        window.location.href = url;
      });
      removeUrlListener = () => sub.remove();

      await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    })();

    return () => removeUrlListener?.();
  }, []);

  return null;
}
