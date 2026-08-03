export const CURRENT_TERMS_VERSION = "2026-08-01";
export const CURRENT_PRIVACY_VERSION = "2026-08-01";

export function formatLegalVersion(version: string): string {
  const [year, month] = version.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}
