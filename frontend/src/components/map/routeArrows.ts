import type maplibregl from "maplibre-gl";

// Shared route styling for CampaignMap and RoutePreviewMap so a route looks identical on
// the main map and the detail page. Layers, bottom to top:
//   - "<prefix>-glow":   soft halo under the route that slowly breathes (opacity).
//   - "<prefix>-comet": a bright head with a fading tail that runs the route start to
//     finish every few seconds (animated line-gradient; the source must have lineMetrics: true).
//   - "<prefix>-arrows": the "▶" direction arrows.
//   - "<prefix>-comet-glow": translucent blue wash over the arrows, driven by the same head
//     position, so arrows look lit as the comet passes.
//   - "<prefix>-start":  a subtle pulsing ring on the route's start point (optional).
// Past events (pastAware) get a faint static glow and no comet or ring.

type RouteArrowOptions = {
  source: string;
  /** Layer id prefix. */
  prefix: string;
  textColor: maplibregl.ExpressionSpecification | string;
  haloColor: string;
  glowColor: maplibregl.ExpressionSpecification | string;
  /** Layer to insert the glow under (the route casing). */
  glowBefore: string;
  /** Source features carry an `is_past` property (CampaignMap) so past routes go static. */
  pastAware?: boolean;
  /** Arrow opacity (e.g. dim past routes). */
  opacity?: maplibregl.ExpressionSpecification | number;
  /** Point source with one feature per route start; adds the pulsing start ring. */
  startSource?: string;
  /** Arrow spacing in px along the line (default 42). */
  arrowSpacing?: number;
};

export function addRouteArrowLayers(m: maplibregl.Map, opts: RouteArrowOptions) {
  const { prefix, source, pastAware } = opts;
  const animate = !reducedMotion();
  const notPast: maplibregl.FilterSpecification = ["!", ["get", "is_past"]];

  m.addLayer(
    {
      id: `${prefix}-glow`,
      type: "line",
      source,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": opts.glowColor,
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 9, 16, 20],
        "line-blur": 6,
        "line-opacity": glowOpacity(0.5, pastAware),
      },
    },
    opts.glowBefore,
  );

  if (animate) {
    const cometLayer = (id: string, width: maplibregl.ExpressionSpecification, blur: number): maplibregl.LayerSpecification => ({
      id,
      type: "line",
      source,
      ...(pastAware ? { filter: notPast } : {}),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-gradient": cometGradient(-1, COMET_GLOW_RGB), "line-width": width, "line-blur": blur },
    });
    const core = cometLayer(`${prefix}-comet`, ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 4.5], 0);
    (core.paint as Record<string, unknown>)["line-gradient"] = cometGradient(-1, COMET_CORE_RGB);
    m.addLayer(core);
  }
  const addCometGlow = () => {
    if (!animate) return;
    m.addLayer({
      id: `${prefix}-comet-glow`,
      type: "line",
      source,
      ...(pastAware ? { filter: notPast } : {}),
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-gradient": cometGradient(-1, COMET_GLOW_RGB, ARROW_LIGHT_PEAK),
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 16, 14],
        "line-blur": 4,
      },
    });
  };

  m.addLayer({
    id: `${prefix}-arrows`,
    type: "symbol",
    source,
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": opts.arrowSpacing ?? 42, // was 60 originally; between that and a much denser 30
      "text-field": "▶",
      "text-size": 14,
      "text-rotation-alignment": "map",
      "text-pitch-alignment": "map",
      "text-keep-upright": false,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: {
      "text-color": opts.textColor,
      "text-halo-color": opts.haloColor,
      "text-halo-width": 1,
      "text-opacity": opts.opacity ?? 1,
    },
  });

  // Added after the arrows so the glow washes over them as the comet passes, tinting them
  // like they're lighting up (symbols can't be lit individually, see header comment).
  addCometGlow();

  if (opts.startSource) {
    m.addLayer({
      id: `${prefix}-start`,
      type: "circle",
      source: opts.startSource,
      paint: {
        "circle-radius": 8,
        "circle-color": "#22c55e",
        "circle-opacity": 0,
        "circle-stroke-color": "#22c55e",
        "circle-stroke-width": 2,
        "circle-stroke-opacity": 0,
        "circle-pitch-alignment": "map",
      },
    });
  }

  if (animate) registerAnimation(m, { prefix, pastAware: !!pastAware, hasStart: !!opts.startSource });
}

function reducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// --- breathing glow ---------------------------------------------------------------

function glowOpacity(v: number, pastAware?: boolean): maplibregl.ExpressionSpecification | number {
  return pastAware ? ["case", ["get", "is_past"], 0.08, v] : v;
}

// --- comet ------------------------------------------------------------------------

const COMET_CORE_RGB = "255,255,255";
const COMET_GLOW_RGB = "125,211,252";
const ARROW_LIGHT_PEAK = 0.4; // translucent so the arrows underneath stay readable while tinted
const TAIL = 0.2; // tail length as a fraction of the route (line-progress is per feature)

// line-gradient stops must ascend strictly within [0,1]. Build them from a piecewise alpha
// curve: transparent -> rising (quadratic) tail -> bright head -> sharp cutoff.
function cometGradient(head: number, rgb: string, peak = 0.95): maplibregl.ExpressionSpecification {
  const alphaAt = (x: number) => {
    if (x > head || x <= head - TAIL) return 0;
    const f = (x - (head - TAIL)) / TAIL;
    return peak * f * f;
  };
  const knots: number[] = [];
  for (let k = 0; k <= 8; k++) knots.push(head - TAIL + (TAIL * k) / 8);
  knots.push(head + 0.0008);
  const inner = knots.filter((p) => p > 0.0005 && p < 0.9995).sort((a, b) => a - b);
  const positions = [0];
  for (const p of inner) if (p - positions[positions.length - 1] > 1e-4) positions.push(p);
  positions.push(1);
  const expr: unknown[] = ["interpolate", ["linear"], ["line-progress"]];
  for (const p of positions) expr.push(p, `rgba(${rgb},${alphaAt(p).toFixed(3)})`);
  return expr as maplibregl.ExpressionSpecification;
}

// --- animation loop ---------------------------------------------------------------

type Registered = { prefix: string; pastAware: boolean; hasStart: boolean };
const FRAME_MS = 50; // ~20fps: smooth enough for glow and comet, easy on mobile batteries
const COMET_CYCLE_S = 11;
const COMET_RUN = 8 / 11; // fraction of the cycle spent running (8s pass, 3s pause)
const registry = new WeakMap<maplibregl.Map, Registered[]>();

function registerAnimation(m: maplibregl.Map, entry: Registered) {
  const existing = registry.get(m);
  if (existing) {
    if (!existing.some((e) => e.prefix === entry.prefix)) existing.push(entry);
    return;
  }
  const entries = [entry];
  registry.set(m, entries);

  let last = 0;
  let cometIdle = false;
  const tick = (now: number) => {
    if (!m.getContainer().isConnected) {
      registry.delete(m);
      return; // map was removed
    }
    if (!document.hidden && now - last >= FRAME_MS) {
      last = now;
      const t = now / 1000;
      const breath = 0.5 + 0.5 * Math.sin(t * 1.6);
      const ph = (t % COMET_CYCLE_S) / COMET_CYCLE_S;
      const running = ph < COMET_RUN;
      const head = running ? (ph / COMET_RUN) * (1 + TAIL) : -1;
      // Only rebuild the gradient while the comet is moving; park it once during the pause.
      const updateComet = running || !cometIdle;
      cometIdle = !running;
      const ringP = (t / 2.5) % 1;

      for (const e of entries) {
        const set = (id: string, prop: string, value: unknown) => {
          if (m.getLayer(id)) m.setPaintProperty(id, prop, value as never);
        };
        set(`${e.prefix}-glow`, "line-opacity", glowOpacity(0.2 + 0.35 * breath, e.pastAware));
        if (updateComet) {
          set(`${e.prefix}-comet-glow`, "line-gradient", cometGradient(head, COMET_GLOW_RGB, ARROW_LIGHT_PEAK));
          set(`${e.prefix}-comet`, "line-gradient", cometGradient(head, COMET_CORE_RGB));
        }
        if (e.hasStart) {
          set(`${e.prefix}-start`, "circle-radius", 8 + 18 * ringP);
          set(`${e.prefix}-start`, "circle-stroke-opacity", 0.55 * (1 - ringP));
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
