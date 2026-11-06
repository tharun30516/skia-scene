import type { Scene, SceneNode } from "./schema.js";

/**
 * Arrange the given nodes into a grid inside the scene, keeping their sizes.
 * Lets an AI agent say "lay out these 6 gauges" without doing coordinate math.
 */
export function gridLayout(
  scene: Scene,
  ids: string[],
  opts: { columns: number; padding?: number; top?: number },
): Scene {
  const padding = opts.padding ?? 24;
  const top = opts.top ?? padding;
  const cols = Math.max(1, opts.columns);
  const rows = Math.ceil(ids.length / cols);
  const cellW = (scene.width - padding * (cols + 1)) / cols;
  const cellH = (scene.height - top - padding * (rows + 1)) / Math.max(rows, 1);

  const pos = new Map<string, { cx: number; cy: number }>();
  ids.forEach((id, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    pos.set(id, {
      cx: padding + c * (cellW + padding) + cellW / 2,
      cy: top + padding + r * (cellH + padding) + cellH / 2,
    });
  });

  return {
    ...scene,
    nodes: scene.nodes.map((n): SceneNode => {
      const p = pos.get(n.id);
      if (!p) return n;
      return centerAt(n, p.cx, p.cy);
    }),
  };
}

/** Move a node so its visual center sits at (cx, cy). */
export function centerAt(n: SceneNode, cx: number, cy: number): SceneNode {
  switch (n.type) {
    case "circle":
    case "gauge":
      return { ...n, x: cx, y: cy };
    case "rect":
    case "bar":
    case "sparkline":
      return { ...n, x: cx - n.w / 2, y: cy - n.h / 2 };
    case "line": {
      const dx = (n.x2 - n.x) / 2;
      const dy = (n.y2 - n.y) / 2;
      return { ...n, x: cx - dx, y: cy - dy, x2: cx + dx, y2: cy + dy };
    }
    case "text":
      return { ...n, x: cx, y: cy, align: "center" };
  }
}
