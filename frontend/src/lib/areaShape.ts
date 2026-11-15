/**
 * Geometry helpers for sponsor-drawn areas (payments v2). The limits mirror
 * backend/app/services/sponsored_cleanups.py, which is the real enforcement; these only
 * give the sponsor instant feedback while drawing.
 */

export type LngLat = [number, number];

export interface Limits {
  siteRadiusMin: number; // meters
  siteRadiusMax: number;
  radiusFtMin: number; // feet, for display
  radiusFtMax: number;
  circleRadiusMin: number; // meters
  circleRadiusMax: number;
  maxGeoUnits: number;
  maxVertices: number;
  minAreaSqm: number; // sponsored areas
  maxAreaSqm: number;
  jobMinAreaSqm: number; // jobs
  jobMaxAreaSqm: number;
}

const SQM_PER_SQFT = 0.092903;
const SQM_PER_SQMI = 2_589_988.11;
const FT_PER_M = 3.28084;

/** game_settings keys behind every limit. Admin edits them in feet, sq ft and sq mi (migration 146). */
export const LIMIT_SETTING_KEYS = [
  "marketplace_job_min_area_sqft",
  "marketplace_job_max_area_sqmi",
  "marketplace_pin_radius_min_ft",
  "marketplace_pin_radius_max_ft",
  "marketplace_max_vertices",
  "sponsored_area_min_sqft",
  "sponsored_area_max_sqmi",
  "sponsored_max_geo_units",
  "sponsored_circle_radius_min_ft",
  "sponsored_circle_radius_max_ft",
] as const;

/** Build limits from the settings values, falling back to the shipped defaults for any missing key. */
export function limitsFromSettings(v: Partial<Record<(typeof LIMIT_SETTING_KEYS)[number], number>>): Limits {
  const ftToM = (ft: number) => Math.round(ft / FT_PER_M);
  const pinMin = v.marketplace_pin_radius_min_ft ?? 25;
  const pinMax = v.marketplace_pin_radius_max_ft ?? 1000;
  return {
    siteRadiusMin: ftToM(pinMin),
    siteRadiusMax: ftToM(pinMax),
    radiusFtMin: pinMin,
    radiusFtMax: pinMax,
    circleRadiusMin: ftToM(v.sponsored_circle_radius_min_ft ?? 100),
    circleRadiusMax: ftToM(v.sponsored_circle_radius_max_ft ?? 1000),
    maxGeoUnits: v.sponsored_max_geo_units ?? 10,
    maxVertices: v.marketplace_max_vertices ?? 60,
    minAreaSqm: (v.sponsored_area_min_sqft ?? 21528) * SQM_PER_SQFT,
    maxAreaSqm: (v.sponsored_area_max_sqmi ?? 2) * SQM_PER_SQMI,
    jobMinAreaSqm: (v.marketplace_job_min_area_sqft ?? 500) * SQM_PER_SQFT,
    jobMaxAreaSqm: (v.marketplace_job_max_area_sqmi ?? 0.1) * SQM_PER_SQMI,
  };
}

/** Defaults, used until the settings load. Same values the settings are seeded with. */
export const LIMITS: Limits = limitsFromSettings({});

const EARTH_R = 6_371_008.8;
const RAD = Math.PI / 180;

/** Polygon ring approximating a circle on the ground (meters), first point repeated at the end. */
export function circleRing(center: LngLat, radiusM: number, steps = 64): LngLat[] {
  const [lng, lat] = center;
  const ring: LngLat[] = [];
  const dLat = (radiusM / EARTH_R) / RAD;
  const dLng = dLat / Math.cos(lat * RAD);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  ring.push(ring[0]);
  return ring;
}

function toMeters(points: LngLat[]): [number, number][] {
  const lat0 = points.reduce((s, p) => s + p[1], 0) / points.length;
  const kx = EARTH_R * RAD * Math.cos(lat0 * RAD);
  const ky = EARTH_R * RAD;
  return points.map((p) => [p[0] * kx, p[1] * ky]);
}

/** Approximate area in square meters (local equirectangular projection, fine at city scale). */
export function polygonAreaSqm(vertices: LngLat[]): number {
  if (vertices.length < 3) return 0;
  const m = toMeters(vertices);
  let sum = 0;
  for (let i = 0; i < m.length; i++) {
    const [x1, y1] = m[i];
    const [x2, y2] = m[(i + 1) % m.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function orient(a: [number, number], b: [number, number], c: [number, number]): number {
  return Math.sign((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
}

function segmentsCross(p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]) {
  return orient(p1, p2, p3) !== orient(p1, p2, p4) && orient(p3, p4, p1) !== orient(p3, p4, p2);
}

/** True when two non-adjacent edges of the closed polygon cross. */
export function selfIntersects(vertices: LngLat[]): boolean {
  const n = vertices.length;
  if (n < 4) return false;
  const m = toMeters(vertices);
  for (let i = 0; i < n; i++) {
    const a1 = m[i];
    const a2 = m[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      // Edges that share a vertex are neighbors, not crossings.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a1, a2, m[j], m[(j + 1) % n])) return true;
    }
  }
  return false;
}

export function formatArea(sqm: number): string {
  const sqmi = sqm / SQM_PER_SQMI;
  // Small shapes read better in square feet; switch to square miles once past 0.01 sq mi (about 28,000 sq ft).
  if (sqmi < 0.01) {
    const sqft = sqm / SQM_PER_SQFT;
    const step = sqft < 1000 ? 10 : 100;
    return `${(Math.round(sqft / step) * step).toLocaleString("en-US")} sq ft`;
  }
  const digits = sqmi >= 1 ? 1 : sqmi >= 0.01 ? 2 : 3;
  const n = sqmi.toFixed(digits);
  return `${n.endsWith(".0") ? n.slice(0, -2) : n} sq mi`;
}

/** Human message for a drawn polygon, or null when it is fine to submit. */
export function polygonProblem(
  vertices: LngLat[],
  maxAreaSqm: number = LIMITS.maxAreaSqm,
  minAreaSqm: number = LIMITS.minAreaSqm,
  tooSmall: string = "That area is too small. Make it bigger.",
  maxVertices: number = LIMITS.maxVertices,
): string | null {
  if (vertices.length < 3) return "Tap at least 3 points on the map.";
  if (vertices.length > maxVertices) return `Use at most ${maxVertices} points.`;
  if (selfIntersects(vertices)) return "The lines cross each other. Drag a point or undo to fix it.";
  const sqm = polygonAreaSqm(vertices);
  if (sqm < minAreaSqm) return tooSmall;
  if (sqm > maxAreaSqm) return `That area is too large (limit ${formatArea(maxAreaSqm)}).`;
  return null;
}

/**
 * Why a corner cannot be added or moved to `next`, or null when it is fine. Used while drawing so a
 * shape never crosses itself, runs past the point cap or grows past the size limit.
 */
export function drawBlocker(next: LngLat[], maxAreaSqm: number = LIMITS.maxAreaSqm, maxVertices: number = LIMITS.maxVertices): string | null {
  if (next.length > maxVertices) return `That is the most points allowed (${maxVertices}).`;
  if (selfIntersects(next)) return "That corner would make the lines cross. Place it somewhere else.";
  if (next.length >= 3 && polygonAreaSqm(next) > maxAreaSqm) return `That would make the area too large (limit ${formatArea(maxAreaSqm)}).`;
  return null;
}

/** Shown when a job area is too small to be worth drawing. */
export const JOB_TOO_SMALL =
  "That area is very small. For a yard, a house or one spot, switch to Drop a pin and describe the job. Drawing is for larger areas like a park or several blocks.";

export { FT_PER_M };
export const RADIUS_FT_STEP = 25;
export const RADIUS_FT_DEFAULT = 150;

/** Meters to feet, rounded to the nearest 5 for display. */
export function metersToFeet(m: number): number {
  return Math.round((m * FT_PER_M) / 5) * 5;
}

/** Feet to whole meters for storage and the API. */
export function feetToMeters(ft: number): number {
  return Math.round(ft / FT_PER_M);
}
