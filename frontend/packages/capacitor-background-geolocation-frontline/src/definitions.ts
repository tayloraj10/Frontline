import type { PluginListenerHandle } from '@capacitor/core';

export type LocationPermissionState = 'granted' | 'whenInUseOnly' | 'denied' | 'prompt';
export type AlwaysPermissionState = 'granted' | 'whenInUseOnly' | 'denied';

export interface LocationPoint {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy: number;
}

export interface StartOptions {
  /** Minimum seconds between emitted points. CLLocationManager has no native interval API, so the plugin throttles by timestamp. */
  intervalSeconds: number;
  desiredAccuracyMeters?: number;
}

export interface BackgroundGeolocationFrontlinePlugin {
  checkPermissions(): Promise<{ location: LocationPermissionState }>;
  requestWhenInUsePermission(): Promise<{ location: 'granted' | 'denied' | 'prompt' }>;
  requestAlwaysPermission(): Promise<{ location: AlwaysPermissionState }>;
  start(options: StartOptions): Promise<{ started: true }>;
  stop(): Promise<void>;
  /** Opens this app's page in the iOS Settings app, for re-granting a denied/whenInUseOnly permission. */
  openSettings(): Promise<void>;
  addListener(
    eventName: 'location',
    listenerFunc: (data: LocationPoint) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'error',
    listenerFunc: (data: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
