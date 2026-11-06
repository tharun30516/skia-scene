import type { DataSnapshot, Scene } from "@skia-scene/core";

/**
 * Fake live data for every `bind` key in the scene: a bounded random walk per key.
 * Swap this for a WebSocket / SSE client to show real telemetry.
 */
export class DataSimulator {
  private values = new Map<string, number>();

  tick(scene: Scene): void {
    for (const n of scene.nodes) {
      if (!n.bind) continue;
      const min = "min" in n ? n.min : 0;
      const max = "max" in n ? n.max : 100;
      const start = "value" in n && typeof n.value === "number" ? n.value : (min + max) / 2;
      const cur = this.values.get(n.bind) ?? start;
      const span = max - min;
      const next = Math.max(min, Math.min(max, cur + (Math.random() - 0.5) * span * 0.06));
      this.values.set(n.bind, next);
    }
  }

  snapshot(): DataSnapshot {
    return Object.fromEntries(this.values);
  }
}
