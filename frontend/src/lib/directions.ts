import { isNativePlatform } from "@/lib/capacitor";

/**
 * Google's universal directions link opens the native Maps app when one is installed, and Google Maps
 * in a browser otherwise. In the Capacitor wrapper it goes through the system browser so the OS can
 * hand it to a real navigation app.
 */
export async function openDirections(lat: number, lng: number) {
  const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  if (isNativePlatform()) {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
    return;
  }
  window.open(url, "_blank");
}
