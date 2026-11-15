/** The least a cleanup must collect to be paid by a sponsorship. Rules saved before this existed count as 1. */
export const DEFAULT_MIN_LARGE_BAGS = 1;
export const MAX_MIN_LARGE_BAGS = 20;

/** What counts as a large bag, shown wherever the minimum is shown. */
export const LARGE_BAG_DEFINITION = "A large bag is a standard 30 gallon trash bag, filled at least three quarters full.";

export function minLargeBags(rule: object | null | undefined): number {
  return Math.max(1, Math.floor(Number((rule as { min_large_bags?: number } | null | undefined)?.min_large_bags) || DEFAULT_MIN_LARGE_BAGS));
}

const bagWord = (n: number) => `large bag${n === 1 ? "" : "s"}`;

/** Short form for a headline: "Minimum 1 large bag". */
export function minBagsShort(rule: object | null | undefined): string {
  const n = minLargeBags(rule);
  return `Minimum ${n} ${bagWord(n)}`;
}

/** Full sentence for a cleaner deciding whether to claim. */
export function minBagsSentence(rule: object | null | undefined): string {
  const n = minLargeBags(rule);
  return `To be paid, you need to collect at least ${n} ${bagWord(n)}. ${LARGE_BAG_DEFINITION}`;
}
