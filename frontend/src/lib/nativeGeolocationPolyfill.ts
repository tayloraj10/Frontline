// The WebView's browser navigator.geolocation only works on secure contexts
// (https, or literal localhost) — CAP_DEV_SERVER points at plain-http
// 10.0.2.2/a LAN IP, so it never qualifies even with OS location permission
// granted. This replaces navigator.geolocation with one backed by
// @capacitor/geolocation (native GPS, no secure-context restriction) so every
// existing caller — MapLibre's GeolocateControl in CampaignMap.tsx above all —
// keeps working unmodified, on native and on web alike.
export async function installNativeGeolocationPolyfill() {
  if (typeof window === "undefined") return;

  const { Geolocation } = await import("@capacitor/geolocation");
  const watchCallbackIds = new Map<number, string>();
  let nextWatchId = 1;

  const toPositionError = (err: unknown): GeolocationPositionError => {
    const message = err instanceof Error ? err.message : "Geolocation error";
    const code = /denied|permission/i.test(message) ? 1 : 2;
    return { code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError;
  };

  const polyfill: Pick<globalThis.Geolocation, "getCurrentPosition" | "watchPosition" | "clearWatch"> = {
    getCurrentPosition(success, error, options) {
      Geolocation.getCurrentPosition({
        enableHighAccuracy: options?.enableHighAccuracy,
        timeout: options?.timeout,
      })
        .then((pos) => success(pos as unknown as GeolocationPosition))
        .catch((err) => error?.(toPositionError(err)));
    },
    watchPosition(success, error, options) {
      const id = nextWatchId++;
      Geolocation
        .watchPosition({ enableHighAccuracy: options?.enableHighAccuracy }, (pos, err) => {
          if (err) { error?.(toPositionError(err)); return; }
          if (pos) success(pos as unknown as GeolocationPosition);
        })
        .then((callbackId) => watchCallbackIds.set(id, callbackId));
      return id;
    },
    clearWatch(id) {
      const callbackId = watchCallbackIds.get(id);
      if (!callbackId) return;
      watchCallbackIds.delete(id);
      Geolocation.clearWatch({ id: callbackId }).catch(() => {});
    },
  };

  Object.defineProperty(navigator, "geolocation", { value: polyfill, configurable: true });
}
