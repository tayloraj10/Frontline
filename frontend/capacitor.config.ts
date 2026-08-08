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
  server: {
    url: devServerUrl || PRODUCTION_URL,
    // Google's OAuth consent screen must NOT be treated as an in-app allowed
    // navigation target — it's opened via @capacitor/browser (system browser)
    // instead, specifically because Google blocks sign-in from embedded WebViews.
    // Cleartext is only enabled for local dev, since `next dev` serves plain http.
    cleartext: Boolean(devServerUrl),
  },
};

export default config;
