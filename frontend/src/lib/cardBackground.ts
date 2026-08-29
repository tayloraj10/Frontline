import { shadeHexColor, capLightness } from "./colorShade";

export type CardBgStyle = "corner" | "vignette" | "vertical" | "diagonal" | "flat";

export const CARD_BG_STYLES: { value: CardBgStyle; label: string }[] = [
  { value: "vertical", label: "Vertical fade" },
  { value: "diagonal", label: "Diagonal fade" },
  { value: "corner", label: "Corner glow" },
  { value: "vignette", label: "Center vignette" },
  { value: "flat", label: "Flat color" },
];

export function cardShades(baseColor: string): { light: string; dark: string } {
  return {
    light: capLightness(shadeHexColor(baseColor, 25), 0.6),
    dark: shadeHexColor(baseColor, -22),
  };
}

/** CSS background value for the DOM preview, matched stop-for-stop with paintCardBackground. */
export function cardBackgroundCss(baseColor: string, style: CardBgStyle): string {
  const { light, dark } = cardShades(baseColor);
  switch (style) {
    case "corner":
      return `radial-gradient(circle at top left, ${light}, ${dark} 70%)`;
    case "vignette":
      return `radial-gradient(circle at center, ${light}, ${dark} 75%)`;
    case "vertical":
      return `linear-gradient(to bottom, ${dark}, ${light})`;
    case "diagonal":
      return `linear-gradient(to bottom right, ${light}, ${dark}, ${light})`;
    case "flat":
      return dark;
  }
}

/** Canvas equivalent of cardBackgroundCss, for the actual exported share-card image. */
export function paintCardBackground(
  ctx: CanvasRenderingContext2D,
  size: number,
  baseColor: string,
  style: CardBgStyle
): void {
  const { light, dark } = cardShades(baseColor);
  let fill: string | CanvasGradient;
  switch (style) {
    case "corner": {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.1);
      g.addColorStop(0, light);
      g.addColorStop(0.7, dark);
      fill = g;
      break;
    }
    case "vignette": {
      const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.75);
      g.addColorStop(0, light);
      g.addColorStop(0.75, dark);
      fill = g;
      break;
    }
    case "vertical": {
      const g = ctx.createLinearGradient(0, 0, 0, size);
      g.addColorStop(0, dark);
      g.addColorStop(1, light);
      fill = g;
      break;
    }
    case "diagonal": {
      const g = ctx.createLinearGradient(0, 0, size, size);
      g.addColorStop(0, light);
      g.addColorStop(0.5, dark);
      g.addColorStop(1, light);
      fill = g;
      break;
    }
    case "flat":
      fill = dark;
      break;
  }
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
}
