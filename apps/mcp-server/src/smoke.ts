/**
 * End-to-end smoke test: drives the tools the way an agent would and writes a PNG.
 * Run: npm run smoke -w @skia-scene/mcp-server
 */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SceneStore } from "./store.js";
import { buildTools } from "./tools.js";

const out = process.argv[2] ?? join(tmpdir(), "skia-scene-smoke.png");
const store = new SceneStore(join(tmpdir(), `skia-scene-${process.pid}.json`));
const tools = Object.fromEntries(buildTools(store).map((t) => [t.name, t]));
const call = (name: string, args: object = {}) => tools[name].run(args);

await call("new_scene", { width: 960, height: 540, background: "#0f172a" });
await call("add_node", { node: { id: "title", type: "text", x: 32, y: 52, text: "Pump Station 4", size: 28, weight: "semibold" } });
const alarms = [{ at: 70, color: "#f59e0b" }, { at: 90, color: "#ef4444" }];
for (const [id, label, value] of [["p1", "Pressure", 48], ["p2", "Flow", 76], ["p3", "Temp", 93]] as const) {
  await call("add_node", { node: { id, type: "gauge", x: 0, y: 0, r: 80, value, label, units: "%", bind: `${id}.value`, thresholds: alarms } });
}
await call("add_node", { node: { id: "tank", type: "bar", x: 0, y: 0, w: 56, h: 220, value: 64, bind: "tank.level", thresholds: [{ at: 85, color: "#ef4444" }] } });
await call("layout_grid", { ids: ["p1", "p2", "p3", "tank"], columns: 4, top: 40 });
await call("add_node", { node: { id: "trend", type: "sparkline", x: 32, y: 440, w: 896, h: 70, values: [40, 44, 43, 50, 58, 55, 61, 66, 63, 70, 74, 72, 79, 83, 80] , maxPoints: 15 } });
await call("add_node", { node: { id: "trendLabel", type: "text", x: 32, y: 430, text: "Pressure trend (last 15 min)", size: 13, color: "#94a3b8" } });

const res = await call("render_png", { data: { "p1.value": 55 } });
const img = res.find((c) => c.type === "image");
if (!img || img.type !== "image") throw new Error("No image returned");
await writeFile(out, Buffer.from(img.data, "base64"));
console.log(`OK: wrote ${out}`);
