import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroidNative(): boolean {
  return Capacitor.getPlatform() === "android";
}

export function isIOSNative(): boolean {
  return Capacitor.getPlatform() === "ios";
}

// isIOSNative() only tells us the app is the iOS Capacitor wrapper, not which app-store
// release it is — native plugins (unlike the JS bundle, which always loads fresh from the
// live site) are compiled into the binary at build time, so a user on an older installed
// app version genuinely lacks a plugin added since then. Gate any feature that depends on a
// specific native plugin with this instead of isIOSNative() alone.
export function hasRouteTrackingCapability(): boolean {
  return isIOSNative() && Capacitor.isPluginAvailable("BackgroundGeolocationFrontline");
}
