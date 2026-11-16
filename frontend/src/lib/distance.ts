/** Distances are stored in meters but always shown to people in feet and miles. */
const FT_PER_M = 3.28084;
const M_PER_MILE = 1609.344;

/** A limit as clean feet, e.g. 152 m is "500 ft" and 91 m is "300 ft". Rounds to the nearest 50. */
export function limitFeet(m: number): number {
  return Math.max(50, Math.round((m * FT_PER_M) / 50) * 50);
}

export function limitLabel(m: number): string {
  return `${limitFeet(m).toLocaleString()} ft`;
}

/** How far away something is, in feet under a fifth of a mile and miles beyond that. */
export function distanceLabel(m: number): string {
  const ft = m * FT_PER_M;
  if (ft < 1000) return `${ft < 100 ? Math.round(ft / 5) * 5 : Math.round(ft / 25) * 25} ft`;
  const mi = m / M_PER_MILE;
  return `${mi < 10 ? mi.toFixed(1) : Math.round(mi).toLocaleString()} mi`;
}
