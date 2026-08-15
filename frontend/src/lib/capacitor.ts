import { Capacitor } from "@capacitor/core";

export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function isAndroidNative(): boolean {
  return Capacitor.getPlatform() === "android";
}
