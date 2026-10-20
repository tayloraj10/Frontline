/**
 * One-shot current position with a plain-language error. Accepts a recent cached fix, tries the
 * quick network/Wi-Fi estimate first, and only then asks for GPS, so desktops without a GPS chip
 * do not sit waiting. A hard timer covers browsers that never answer the permission prompt.
 */
const ask = (options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, options));

export async function getPosition(): Promise<GeolocationPosition> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Location is not available on this device.");
  }
  const attempt = (async () => {
    try {
      return await ask({ enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 });
    } catch (err) {
      if ((err as GeolocationPositionError).code === 1) throw err;
      return await ask({ enableHighAccuracy: true, maximumAge: 0, timeout: 12000 });
    }
  })();
  const hardStop = new Promise<never>((_, reject) =>
    window.setTimeout(() => reject(new Error("Location is taking too long. Check that it is allowed, then try again.")), 25000),
  );
  try {
    return await Promise.race([attempt, hardStop]);
  } catch (err) {
    if ((err as GeolocationPositionError).code === 1) {
      throw new Error("Location is blocked for this site. Allow it in your browser settings, then try again.");
    }
    if (err instanceof Error && err.message.startsWith("Location is")) throw err;
    throw new Error("Could not get your location. Move somewhere with a clearer signal and try again.");
  }
}
