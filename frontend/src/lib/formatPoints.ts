// Points can be fractional (e.g. trash_report_value = 0.5), so a plain Math.round() before
// display rounds 0.5 up to a whole point and misleads users about their real balance.
// Whole numbers still render without a decimal; fractional values keep exactly one.
export function formatPoints(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString()
    : value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
