import type { CapacitorConfig } from '@capacitor/cli';

const PRODUCTION_URL = 'https://www.frontlinemaps.com';

const config: CapacitorConfig = {
  appId: 'com.frontline.app',
  appName: 'Frontline',
  webDir: 'www',
  server: {
    url: PRODUCTION_URL,
    // Google's OAuth consent screen must NOT be treated as an in-app allowed
    // navigation target — it's opened via @capacitor/browser (system browser)
    // instead, specifically because Google blocks sign-in from embedded WebViews.
    cleartext: false,
  },
};

export default config;
