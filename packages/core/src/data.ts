import type { Scene, SceneNode, Threshold } from "./schema.js";

/** Live values keyed by binding name, e.g. { "pump1.pressure": 72.4 }. */
export type DataSnapshot = Record<string, number>;

/** Pick the color of the highest threshold the value has reached, else the base color. */
export function colorFor(value: number | undefined, base: string, thresholds: Threshold[]): string {
  if (value === undefined || thresholds.length === 0) return base;
  let color = base;
  let best = -Infinity;
  for (const t of thresholds) {
    if (value >= t.at && t.at >= best) {
      best = t.at;
      color = t.color;
    }
  }
  return color;
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Return a new scene with bound values applied. Pure: the input is not changed.
 * - gauge / bar / rect / circle: `value` is replaced
 * - text: `{value}` in the text is replaced (rounded to 1 decimal)
 * - sparkline: the value is appended, keeping at most `maxPoints`
 */
export function applyData(scene: Scene, data: DataSnapshot): Scene {
  return {
    ...scene,
    nodes: scene.nodes.map((n): SceneNode => {
      if (!n.bind || !(n.bind in data)) return n;
      const v = data[n.bind];
      switch (n.type) {
        case "gauge":
        case "bar":
        case "rect":
        case "circle":
          return { ...n, value: v };
        case "text":
          return { ...n, value: v };
        case "sparkline": {
          const values = [...n.values, v].slice(-n.maxPoints);
          return { ...n, values };
        }
        default:
          return n;
      }
    }),
  };
}

/** Text shown for a text node, filling in `{value}` when bound. */
export function displayText(n: Extract<SceneNode, { type: "text" }>): string {
  if (n.value === undefined) return n.text;
  return n.text.replace(/\{value\}/g, (Math.round(n.value * 10) / 10).toString());
}
