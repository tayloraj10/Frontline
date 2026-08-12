/**
 * Standard competition ranking ("1224" ranking): entries tied on `value` share the
 * same rank, and the next distinct value skips ranks by the number of ties
 * (e.g. 1, 2, 2, 2, 5) — the convention used by most sports/competition leaderboards.
 * Assumes `items` is already sorted descending by `value`.
 */
export function computeRanks<T>(items: T[], value: (item: T) => number): number[] {
  const ranks: number[] = [];
  let lastValue: number | null = null;
  let lastRank = 0;
  items.forEach((item, i) => {
    const v = value(item);
    if (lastValue === null || v !== lastValue) {
      lastRank = i + 1;
      lastValue = v;
    }
    ranks.push(lastRank);
  });
  return ranks;
}
