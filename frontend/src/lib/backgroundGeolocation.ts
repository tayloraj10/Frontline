import { isNativePlatform } from "@/lib/capacitor";

export type TrackingPermissionResult = "granted" | "whenInUseOnly" | "denied";

export interface TrackedPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

// Deliberately separate from CampaignMap's GeolocateControl / navigator.geolocation
// polyfill (nativeGeolocationPolyfill.ts) — this drives our own custom native
// plugin's background CLLocationManager session, not the WebView's geolocation API.
// iOS-only for now; Android support would live in the same plugin package with
// no changes needed here (see capacitor-background-geolocation-frontline).

async function loadPlugin() {
  const { BackgroundGeolocationFrontline } = await import(
    "capacitor-background-geolocation-frontline"
  );
  return BackgroundGeolocationFrontline;
}

/**
 * Runs the two-step iOS permission upgrade: When-In-Use, then (only if that's
 * granted in this session) Always. iOS only shows the Always dialog immediately
 * after When-In-Use is granted, so these calls must happen back-to-back.
 */
export async function requestTrackingPermission(): Promise<TrackingPermissionResult> {
  console.log("[track] requestTrackingPermission: start");
  if (!isNativePlatform()) {
    console.log("[track] requestTrackingPermission: not native, returning denied");
    return "denied";
  }
  console.log("[track] requestTrackingPermission: loading plugin");
  const plugin = await loadPlugin();
  console.log("[track] requestTrackingPermission: plugin loaded, calling checkPermissions");

  const current = await plugin.checkPermissions();
  console.log("[track] checkPermissions resolved:", current);
  if (current.location === "granted") return "granted";

  if (current.location === "prompt") {
    console.log("[track] calling requestWhenInUsePermission");
    const whenInUse = await plugin.requestWhenInUsePermission();
    console.log("[track] requestWhenInUsePermission resolved:", whenInUse);
    if (whenInUse.location !== "granted") return "denied";
  } else if (current.location === "denied") {
    return "denied";
  }

  console.log("[track] calling requestAlwaysPermission");
  const always = await plugin.requestAlwaysPermission();
  console.log("[track] requestAlwaysPermission resolved:", always);
  return always.location;
}

export async function openLocationSettings(): Promise<void> {
  if (!isNativePlatform()) return;
  const plugin = await loadPlugin();
  await plugin.openSettings();
}

/** Starts a background-tracked route. Returns a handle to stop it and remove listeners. */
export async function startRouteTracking(
  onPoint: (point: TrackedPoint) => void,
  onError: (message: string) => void,
  intervalSeconds = 12,
): Promise<{ stop: () => Promise<void> }> {
  const plugin = await loadPlugin();

  const locationHandle = await plugin.addListener("location", onPoint);
  const errorHandle = await plugin.addListener("error", (data) => onError(data.message));

  await plugin.start({ intervalSeconds });

  return {
    stop: async () => {
      await plugin.stop().catch(() => {});
      await locationHandle.remove().catch(() => {});
      await errorHandle.remove().catch(() => {});
    },
  };
}
