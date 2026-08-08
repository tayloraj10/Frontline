"use client";

import { useEffect } from "react";
import { isNativePlatform } from "@/lib/capacitor";
import { createClient } from "@/lib/supabase/client";
import { registerDeviceToken } from "@/lib/pushNotifications";
import { installNativeGeolocationPolyfill } from "@/lib/nativeGeolocationPolyfill";

// Mounted once in the root layout. No-ops entirely on web — everything here
// only matters inside the Capacitor-wrapped iOS/Android build.
export default function NativeAppBridge() {
  useEffect(() => {
    if (!isNativePlatform()) return;

    let removeUrlListener: (() => void) | undefined;
    let removePushListeners: (() => void) | undefined;
    let removeAuthListener: (() => void) | undefined;

    (async () => {
      const [{ App }, { Browser }, { StatusBar, Style }, { Capacitor }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
        import("@capacitor/status-bar"),
        import("@capacitor/core"),
      ]);

      // Google's OAuth screen can't be shown inside the app's embedded WebView
      // (Google blocks embedded user agents), so login opens it in the system
      // browser instead. Once Google/Supabase finish and redirect back to our
      // production callback URL, that redirect arrives here as an app-open
      // event (via Universal Links / App Links) — close the system browser and
      // hand the URL to the main WebView to continue the normal cookie-based
      // session flow.
      const sub = await App.addListener("appUrlOpen", ({ url }) => {
        let origin: string;
        try {
          origin = new URL(url).origin;
        } catch {
          return;
        }
        if (origin !== "https://www.frontlinemaps.com") return;
        Browser.close().catch(() => {});
        window.location.href = url;
      });
      removeUrlListener = () => sub.remove();

      await StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
      await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      await installNativeGeolocationPolyfill().catch(() => {});

      const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";
      const { PushNotifications } = await import("@capacitor/push-notifications");

      // The 'registration' event only fires once PushNotifications.register()
      // resolves, with no way to pass data through it — so the user id it
      // should be registered against has to be handed off via this closure var.
      let pendingUserId: string | null = null;
      let pendingAccessToken: string | null = null;

      const registrationSub = await PushNotifications.addListener("registration", (token) => {
        if (!pendingUserId || !pendingAccessToken) return;
        registerDeviceToken(pendingUserId, token.value, platform, pendingAccessToken).catch(() => {});
      });

      const tapSub = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
        const url = action.notification.data?.url;
        if (typeof url === "string") window.location.href = url;
      });

      removePushListeners = () => {
        registrationSub.remove();
        tapSub.remove();
      };

      const registerForPush = async (userId: string, accessToken: string) => {
        const perms = await PushNotifications.checkPermissions();
        let status = perms.receive;
        if (status === "prompt" || status === "prompt-with-rationale") {
          status = (await PushNotifications.requestPermissions()).receive;
        }
        if (status !== "granted") return;
        pendingUserId = userId;
        pendingAccessToken = accessToken;
        await PushNotifications.register();
      };

      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session) {
        registerForPush(sessionData.session.user.id, sessionData.session.access_token).catch(() => {});
      }

      const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_IN" && session) registerForPush(session.user.id, session.access_token).catch(() => {});
      });
      removeAuthListener = () => authListener.subscription.unsubscribe();
    })();

    return () => {
      removeUrlListener?.();
      removePushListeners?.();
      removeAuthListener?.();
    };
  }, []);

  return null;
}
