import type { CapacitorConfig } from '@capacitor/cli';

const PRODUCTION_URL = 'https://www.frontlinemaps.com';

// Set CAP_DEV_SERVER to point the native shell at a local `next dev` server
// instead of prod. 10.0.2.2 is the Android emulator's alias for the host
// machine's localhost — a physical device needs the host's LAN IP instead
// (e.g. CAP_DEV_SERVER=http://192.168.1.23:3000). After changing this, run
// `npx cap sync android`/`ios` and rebuild — the value gets baked into the
// native project, it isn't read at app runtime.
const devServerUrl = process.env.CAP_DEV_SERVER;

const config: CapacitorConfig = {
  appId: 'com.frontlinemaps.app',
  appName: 'Frontline',
  webDir: 'www',
  // Lets the server tell native app requests apart from real mobile-web
  // visitors (e.g. to scope pinch-zoom-disabling viewport settings to the
  // app only) — see generateViewport() in src/app/layout.tsx.
  appendUserAgent: 'FrontlineNativeApp',
  server: {
    url: devServerUrl || PRODUCTION_URL,
    // Google's OAuth consent screen must NOT be treated as an in-app allowed
    // navigation target — it's opened via @capacitor/browser (system browser)
    // instead, specifically because Google blocks sign-in from embedded WebViews.
    // Cleartext is only enabled for local dev, since `next dev` serves plain http.
    cleartext: Boolean(devServerUrl),
  },
  // iOS's native LaunchScreen auto-hides ~500ms after launch by default,
  // handing off to a blank WKWebView if the page hasn't painted yet.
  // launchAutoHide: false keeps the splash up until NativeAppBridge calls
  // SplashScreen.hide() once the page is actually ready — with a bounded
  // fallback timeout in NativeAppBridge so a hung/failed load can never
  // leave it stuck forever. Android doesn't use this plugin — its splash
  // is the separate native androidx.core.splashscreen mechanism — so this
  // has no effect there.
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      // Matches LaunchScreen.storyboard's background exactly. Set to pure
      // black (not the tile's #111217 fill) because the Splash image has a
      // baked-in #000000 keyline stroke around its rounded-square edge —
      // matching the fill color still left that stroke visible as a ring.
      backgroundColor: '#000000',
    },
    // Native Google Sign-In SDK — replaces the old browser-redirect OAuth
    // flow on iOS, which relied on SFSafariViewController following a
    // redirect into a custom URL scheme. That doesn't happen reliably (a
    // known iOS platform limitation), so this bypasses the browser entirely.
    // The ID token Google returns is audienced to iOSClientId (not
    // iOSServerClientId — that's only used for the separate offline
    // server-auth-code flow, not the ID token itself), so the iOS client ID
    // must be added to Supabase's Google provider allowed client IDs list.
    SocialLogin: {
      google: {
        iOSClientId: '739267403997-v2njpfsgr8kcmfh4lrum50ks78majf6f.apps.googleusercontent.com',
        iOSServerClientId: '739267403997-e0b8jujgl51c8vpiiemhm4f8v78phfmm.apps.googleusercontent.com',
        // Android's Credential Manager has no per-platform client ID; it identifies
        // the app via package name + SHA-1 registered on the Android OAuth client
        // in Cloud Console. webClientId is the web-type client, used as token audience.
        webClientId: '739267403997-e0b8jujgl51c8vpiiemhm4f8v78phfmm.apps.googleusercontent.com',
        mode: 'online',
      },
    },
  },
};

export default config;
