/** Lightens (positive percent) or darkens (negative percent) a hex color by
 * blending each channel toward 255 or 0. Used for share-card gradients where a
 * flat black midpoint made light text unreadable -- a shade of the same color
 * keeps contrast without going fully dark. */
export function shadeHexColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const amt = Math.round(2.55 * percent);
  const nr = Math.min(255, Math.max(0, r + amt));
  const ng = Math.min(255, Math.max(0, g + amt));
  const nb = Math.min(255, Math.max(0, b + amt));
  return rgbToHex(nr, ng, nb);
}

/** Caps how light a color can get by scaling it back down toward black when its
 * luminance exceeds maxLuma (0-1). Prevents a lightened gradient stop from getting
 * so pale that white overlay text becomes hard to read. */
export function capLightness(hex: string, maxLuma = 0.72): string {
  const { r, g, b } = hexToRgb(hex);
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (luma <= maxLuma) return hex;
  const scale = maxLuma / luma;
  return rgbToHex(Math.round(r * scale), Math.round(g * scale), Math.round(b * scale));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 0xff, g: (num >> 8) & 0xff, b: num & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
