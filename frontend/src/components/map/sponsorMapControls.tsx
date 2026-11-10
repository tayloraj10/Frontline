import maplibregl from "maplibre-gl";

/** Round-rect map button used by every sponsorship map, so the controls look identical. */
export const mapIconBtn =
  "flex h-10 w-10 items-center justify-center rounded-md bg-black/60 text-white transition-[background-color,transform] duration-150 hover:bg-black/80 active:scale-[0.92] disabled:opacity-40 touch-manipulation";

export const ExpandIcon = ({ open }: { open: boolean }) => (
  <svg
    width={18}
    height={18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />}
  </svg>
);

/** The standard "find me" control, identical on every sponsorship map. */
export const newGeolocateControl = () =>
  new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false });
