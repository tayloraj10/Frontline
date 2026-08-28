import { registerPlugin } from '@capacitor/core';

import type { BackgroundGeolocationFrontlinePlugin } from './definitions';

const BackgroundGeolocationFrontline = registerPlugin<BackgroundGeolocationFrontlinePlugin>(
  'BackgroundGeolocationFrontline',
);

export * from './definitions';
export { BackgroundGeolocationFrontline };
