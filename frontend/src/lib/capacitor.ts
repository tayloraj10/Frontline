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
