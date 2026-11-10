/**
 * Geometry helpers for sponsor-drawn areas (payments v2). The limits mirror
 * backend/app/services/sponsored_cleanups.py, which is the real enforcement; these only
 * give the sponsor instant feedback while drawing.
 */

export type LngLat = [number, number];

export const LIMITS = {
  siteRadiusMin: 10,
  siteRadiusMax: 500,
  circleRadiusMin: 50,
  circleRadiusMax: 1500,
  maxGeoUnits: 10,
  maxVertices: 60,
  minAreaSqm: 2_000,
  maxAreaSqm: 5_000_000,
} as const;

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
  if (sqm >= 100_000) return `${(sqm / 1_000_000).toFixed(2)} sq km`;
  return `${Math.round(sqm).toLocaleString("en-US")} sq m`;
}

/** Human message for a drawn polygon, or null when it is fine to submit. */
export function polygonProblem(vertices: LngLat[]): string | null {
  if (vertices.length < 3) return "Tap at least 3 points on the map.";
  if (vertices.length > LIMITS.maxVertices) return `Use at most ${LIMITS.maxVertices} points.`;
  if (selfIntersects(vertices)) return "The lines cross each other. Drag a point or undo to fix it.";
  const sqm = polygonAreaSqm(vertices);
  if (sqm < LIMITS.minAreaSqm) return "That area is too small. Make it bigger.";
  if (sqm > LIMITS.maxAreaSqm) return `That area is too large (limit ${LIMITS.maxAreaSqm / 1_000_000} sq km).`;
  return null;
}
