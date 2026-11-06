import type { Canvas, CanvasKit, Font, Paint, Typeface } from "canvaskit-wasm";
import type { Scene, SceneNode } from "./schema.js";
import { clamp01, colorFor, displayText } from "./data.js";

export interface Fonts {
  regular: Typeface;
  semibold: Typeface;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Draws a scene onto any Skia canvas (browser WebGL surface or CPU surface in Node).
 * Every frame builds its paints from the scene, so the scene JSON is the only state.
 */
export class SceneRenderer {
  private fontCache = new Map<string, Font>();

  constructor(private ck: CanvasKit, private fonts: Fonts) {}

  render(canvas: Canvas, scene: Scene, selectedId?: string): void {
    const ck = this.ck;
    canvas.clear(ck.parseColorString(scene.background));
    for (const node of scene.nodes) {
      canvas.save();
      this.applyTransform(canvas, node);
      this.drawNode(canvas, node);
      canvas.restore();
    }
    if (selectedId) {
      const n = scene.nodes.find((x) => x.id === selectedId);
      if (n) this.drawSelection(canvas, n);
    }
  }

  /** Axis-aligned bounds before rotation; used for hit testing and selection. */
  bounds(n: SceneNode): Bounds {
    switch (n.type) {
      case "rect":
      case "bar":
      case "sparkline":
        return { x: n.x, y: n.y, w: n.w, h: n.h };
      case "circle":
        return { x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 };
      case "gauge":
        return { x: n.x - n.r, y: n.y - n.r, w: n.r * 2, h: n.r * 2 + 24 };
      case "line":
        return {
          x: Math.min(n.x, n.x2),
          y: Math.min(n.y, n.y2) - n.strokeWidth,
          w: Math.abs(n.x2 - n.x) || n.strokeWidth,
          h: Math.abs(n.y2 - n.y) + n.strokeWidth * 2,
        };
      case "text": {
        const w = this.measure(displayText(n), n.size, n.weight);
        const left = n.align === "center" ? n.x - w / 2 : n.align === "right" ? n.x - w : n.x;
        return { x: left, y: n.y - n.size, w, h: n.size * 1.25 };
      }
    }
  }

  /** Topmost node under the point, ignoring rotation (good enough for an editor). */
  hitTest(scene: Scene, px: number, py: number): SceneNode | undefined {
    for (let i = scene.nodes.length - 1; i >= 0; i--) {
      const b = this.bounds(scene.nodes[i]);
      if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return scene.nodes[i];
    }
    return undefined;
  }

  measure(text: string, size: number, weight: "regular" | "semibold" = "regular"): number {
    const font = this.font(size, weight);
    const ids = font.getGlyphIDs(text);
    const widths = font.getGlyphWidths(ids);
    let w = 0;
    for (const x of widths) w += x;
    return w;
  }

  dispose(): void {
    for (const f of this.fontCache.values()) f.delete();
    this.fontCache.clear();
  }

  // ---------- drawing ----------

  private applyTransform(canvas: Canvas, n: SceneNode): void {
    if (!n.rotation) return;
    const b = this.bounds(n);
    canvas.rotate(n.rotation, b.x + b.w / 2, b.y + b.h / 2);
  }

  private drawNode(canvas: Canvas, n: SceneNode): void {
    const ck = this.ck;
    switch (n.type) {
      case "rect": {
        const rect = ck.XYWHRect(n.x, n.y, n.w, n.h);
        const rr = ck.RRectXY(rect, n.radius, n.radius);
        this.withPaint(colorFor(n.value, n.fill, n.thresholds), n.opacity, (p) => canvas.drawRRect(rr, p));
        if (n.stroke) this.withStroke(n.stroke, n.strokeWidth, n.opacity, (p) => canvas.drawRRect(rr, p));
        return;
      }
      case "circle": {
        this.withPaint(colorFor(n.value, n.fill, n.thresholds), n.opacity, (p) => canvas.drawCircle(n.x, n.y, n.r, p));
        if (n.stroke) this.withStroke(n.stroke, n.strokeWidth, n.opacity, (p) => canvas.drawCircle(n.x, n.y, n.r, p));
        return;
      }
      case "line": {
        this.withStroke(n.stroke, n.strokeWidth, n.opacity, (p) => {
          if (n.dashed) {
            const effect = ck.PathEffect.MakeDash([n.strokeWidth * 3, n.strokeWidth * 2], 0);
            p.setPathEffect(effect);
            canvas.drawLine(n.x, n.y, n.x2, n.y2, p);
            effect.delete();
          } else {
            canvas.drawLine(n.x, n.y, n.x2, n.y2, p);
          }
        });
        return;
      }
      case "text": {
        const text = displayText(n);
        const w = this.measure(text, n.size, n.weight);
        const x = n.align === "center" ? n.x - w / 2 : n.align === "right" ? n.x - w : n.x;
        this.withPaint(n.color, n.opacity, (p) => canvas.drawText(text, x, n.y, p, this.font(n.size, n.weight)));
        return;
      }
      case "gauge":
        return this.drawGauge(canvas, n);
      case "bar":
        return this.drawBar(canvas, n);
      case "sparkline":
        return this.drawSparkline(canvas, n);
    }
  }

  /** 270° arc gauge: track, value arc (threshold colored), value text and label. */
  private drawGauge(canvas: Canvas, n: Extract<SceneNode, { type: "gauge" }>): void {
    const ck = this.ck;
    const thickness = Math.max(4, n.r * 0.16);
    const oval = ck.LTRBRect(n.x - n.r, n.y - n.r, n.x + n.r, n.y + n.r);
    const start = 135;
    const sweep = 270;
    const t = clamp01((n.value - n.min) / (n.max - n.min || 1));

    this.withStroke("#334155", thickness, n.opacity, (p) => {
      p.setStrokeCap(ck.StrokeCap.Round);
      canvas.drawArc(oval, start, sweep, false, p);
    });
    if (t > 0) {
      this.withStroke(colorFor(n.value, n.color, n.thresholds), thickness, n.opacity, (p) => {
        p.setStrokeCap(ck.StrokeCap.Round);
        canvas.drawArc(oval, start, sweep * t, false, p);
      });
    }

    const valueText = `${Math.round(n.value * 10) / 10}${n.units}`;
    const vs = n.r * 0.42;
    const vw = this.measure(valueText, vs, "semibold");
    this.withPaint("#f8fafc", n.opacity, (p) =>
      canvas.drawText(valueText, n.x - vw / 2, n.y + vs * 0.35, p, this.font(vs, "semibold")),
    );
    if (n.label) {
      const ls = Math.max(11, n.r * 0.2);
      const lw = this.measure(n.label, ls);
      this.withPaint("#94a3b8", n.opacity, (p) =>
        canvas.drawText(n.label!, n.x - lw / 2, n.y + n.r + ls, p, this.font(ls, "regular")),
      );
    }
  }

  private drawBar(canvas: Canvas, n: Extract<SceneNode, { type: "bar" }>): void {
    const ck = this.ck;
    const track = ck.RRectXY(ck.XYWHRect(n.x, n.y, n.w, n.h), 4, 4);
    this.withPaint("#1e293b", n.opacity, (p) => canvas.drawRRect(track, p));
    const t = clamp01((n.value - n.min) / (n.max - n.min || 1));
    if (t <= 0) return;
    // Vertical bars fill bottom-up, horizontal bars fill left-to-right.
    const vertical = n.h > n.w;
    const fill = vertical
      ? ck.XYWHRect(n.x, n.y + n.h * (1 - t), n.w, n.h * t)
      : ck.XYWHRect(n.x, n.y, n.w * t, n.h);
    this.withPaint(colorFor(n.value, n.color, n.thresholds), n.opacity, (p) =>
      canvas.drawRRect(ck.RRectXY(fill, 4, 4), p),
    );
  }

  private drawSparkline(canvas: Canvas, n: Extract<SceneNode, { type: "sparkline" }>): void {
    const ck = this.ck;
    if (n.values.length < 2) return;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of n.values) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const span = hi - lo || 1;
    const step = n.w / (n.maxPoints - 1);
    const offset = (n.maxPoints - n.values.length) * step; // newest point stays at the right edge
    const path = new ck.Path();
    n.values.forEach((v, i) => {
      const x = n.x + offset + i * step;
      const y = n.y + n.h - ((v - lo) / span) * n.h;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    });
    this.withStroke(n.color, 2, n.opacity, (p) => {
      p.setStrokeJoin(ck.StrokeJoin.Round);
      canvas.drawPath(path, p);
    });
    path.delete();
  }

  private drawSelection(canvas: Canvas, n: SceneNode): void {
    const b = this.bounds(n);
    const ck = this.ck;
    this.withStroke("#f59e0b", 1.5, 1, (p) => {
      const effect = ck.PathEffect.MakeDash([5, 4], 0);
      p.setPathEffect(effect);
      canvas.drawRect(ck.XYWHRect(b.x - 4, b.y - 4, b.w + 8, b.h + 8), p);
      effect.delete();
    });
  }

  // ---------- helpers (every Paint is freed: CanvasKit objects live in WASM memory) ----------

  private withPaint(color: string, opacity: number, draw: (p: Paint) => void): void {
    const p = new this.ck.Paint();
    p.setAntiAlias(true);
    p.setColor(this.ck.parseColorString(color));
    p.setAlphaf(p.getColor()[3] * opacity);
    try {
      draw(p);
    } finally {
      p.delete();
    }
  }

  private withStroke(color: string, width: number, opacity: number, draw: (p: Paint) => void): void {
    this.withPaint(color, opacity, (p) => {
      p.setStyle(this.ck.PaintStyle.Stroke);
      p.setStrokeWidth(width);
      draw(p);
    });
  }

  private font(size: number, weight: "regular" | "semibold"): Font {
    const key = `${weight}:${Math.round(size * 2) / 2}`;
    let f = this.fontCache.get(key);
    if (!f) {
      f = new this.ck.Font(weight === "semibold" ? this.fonts.semibold : this.fonts.regular, size);
      this.fontCache.set(key, f);
    }
    return f;
  }
}
