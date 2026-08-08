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

    // Android's native splashscreen library gives a minimum-visible-time and
    // a smooth exit fade for free; the Capacitor plugin does neither on its
    // own (an unconfigured hide() is an instant, zero-duration cut). Match
    // that polish manually: keep the splash up for at least MIN_SPLASH_MS
    // from launch, then fade it out over FADE_OUT_MS.
    const MIN_SPLASH_MS = 1500;
    const FADE_OUT_MS = 250;
    const launchedAt = Date.now();
    const hideSplash = (SplashScreen: typeof import("@capacitor/splash-screen").SplashScreen) => {
      const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - launchedAt));
      setTimeout(() => {
        SplashScreen.hide({ fadeOutDuration: FADE_OUT_MS }).catch(() => {});
      }, remaining);
    };

    // Hard fallback: if the page never finishes mounting (hung network,
    // failed load, chunk-load error), force-hide the splash so it can never
    // block the app forever — see capacitor.config.ts for why launchAutoHide
    // is disabled in the first place.
    const splashSafetyTimeout = setTimeout(() => {
      import("@capacitor/splash-screen").then(({ SplashScreen }) => hideSplash(SplashScreen));
    }, 8000);

    (async () => {
      const [{ App }, { Browser }, { StatusBar, Style }, { Capacitor }, { SplashScreen }] = await Promise.all([
        import("@capacitor/app"),
        import("@capacitor/browser"),
        import("@capacitor/status-bar"),
        import("@capacitor/core"),
        import("@capacitor/splash-screen"),
      ]);

      clearTimeout(splashSafetyTimeout);
      hideSplash(SplashScreen);

      // Google's OAuth screen can't be shown inside the app's embedded WebView
      // (Google blocks embedded user agents), so login opens it in the system
      // browser instead. The redirect back uses our custom URL scheme
      // (com.frontlinemaps.app://auth/callback) rather than a Universal Link,
      // since Universal Links only reliably fire on a user tap and not on the
      // automatic redirect chain Google/Supabase do after consent — a custom
      // scheme always triggers this appUrlOpen event. Regular https deep
      // links (push notification taps, shared campaign links, etc.) still
      // come through here too, so both forms are handled.
      const sub = await App.addListener("appUrlOpen", async ({ url }) => {
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return;
        }
        const isProdLink = parsed.origin === "https://www.frontlinemaps.com";
        const isAuthCallbackScheme =
          parsed.protocol === "com.frontlinemaps.app:" && parsed.host === "auth" && parsed.pathname === "/callback";
        if (!isProdLink && !isAuthCallbackScheme) return;
        await Browser.close().catch(() => {});
        const targetUrl = isAuthCallbackScheme ? `https://www.frontlinemaps.com/auth/callback${parsed.search}` : url;
        window.location.href = targetUrl;
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

      // On iOS, Capacitor's core plugin hands back the raw APNs device token,
      // not an FCM token — but send-push (supabase/functions/send-push) only
      // knows how to send through FCM's API. @capacitor-community/fcm wraps the
      // native Firebase Messaging SDK to exchange that APNs token for a real FCM
      // one; Android's core registration event already returns an FCM token
      // directly; so only iOS needs the extra hop.
      const registrationSub = await PushNotifications.addListener("registration", async (token) => {
        const userId = pendingUserId;
        const accessToken = pendingAccessToken;
        if (!userId || !accessToken) return;
        let value = token.value;
        if (platform === "ios") {
          const { FCM } = await import("@capacitor-community/fcm");
          value = (await FCM.getToken()).token;
        }
        registerDeviceToken(userId, value, platform, accessToken).catch(() => {});
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
      clearTimeout(splashSafetyTimeout);
      removeUrlListener?.();
      removePushListeners?.();
      removeAuthListener?.();
    };
  }, []);

  return null;
}
