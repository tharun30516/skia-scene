import type { SceneNode } from "@skia-scene/core";

const alarms = [
  { at: 70, color: "#f59e0b" },
  { at: 90, color: "#ef4444" },
];

/** Sensible starting node for each type, centered near (cx, cy). */
export function defaultsFor(type: SceneNode["type"], id: string, cx: number, cy: number): unknown {
  switch (type) {
    case "gauge":
      return { id, type, x: cx, y: cy, r: 70, value: 50, label: id, units: "%", bind: `${id}.value`, thresholds: alarms };
    case "bar":
      return { id, type, x: cx - 24, y: cy - 100, w: 48, h: 200, value: 60, bind: `${id}.value`, thresholds: alarms };
    case "sparkline":
      return { id, type, x: cx - 150, y: cy - 30, w: 300, h: 60, values: [], bind: `${id}.value` };
    case "rect":
      return { id, type, x: cx - 80, y: cy - 50, w: 160, h: 100, radius: 10, fill: "#1e293b", stroke: "#334155" };
    case "circle":
      return { id, type, x: cx, y: cy, r: 40, fill: "#3b82f6" };
    case "text":
      return { id, type, x: cx, y: cy, text: "Label", size: 20, align: "center" };
    case "line":
      return { id, type, x: cx - 100, y: cy, x2: cx + 100, y2: cy, dashed: true };
  }
}
