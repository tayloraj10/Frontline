// Set when the user explicitly asks for the homepage (e.g. clicks the logo), so the
// first-landing auto-redirect on "/" (see HomeAutoRedirect) doesn't bounce them to the map.
let homeRequested = false;

export function requestHome() {
  homeRequested = true;
}

export function consumeHomeRequest(): boolean {
  const was = homeRequested;
  homeRequested = false;
  return was;
}
