import { test } from "node:test";
import assert from "node:assert/strict";
import { applyData, colorFor, gridLayout, parseScene } from "../src/index.js";

test("colorFor picks the highest threshold reached", () => {
  const t = [{ at: 70, color: "#f59e0b" }, { at: 90, color: "#ef4444" }];
  assert.equal(colorFor(50, "#22c55e", t), "#22c55e");
  assert.equal(colorFor(75, "#22c55e", t), "#f59e0b");
  assert.equal(colorFor(95, "#22c55e", t), "#ef4444");
  assert.equal(colorFor(undefined, "#22c55e", t), "#22c55e");
});

test("parseScene fills defaults and rejects duplicate ids", () => {
  const s = parseScene({ width: 100, height: 100, nodes: [{ id: "a", type: "circle", x: 1, y: 1, r: 5 }] });
  assert.equal(s.background, "#0f172a");
  assert.equal(s.nodes[0].opacity, 1);
  assert.throws(() =>
    parseScene({ width: 100, height: 100, nodes: [{ id: "a", type: "circle", x: 1, y: 1, r: 5 }, { id: "a", type: "circle", x: 1, y: 1, r: 5 }] }),
    /duplicate/,
  );
  assert.throws(() => parseScene({ width: 100, height: 100, nodes: [{ id: "b", type: "rect", x: 0, y: 0, w: -1, h: 1 }] }), /Invalid/);
});

test("applyData binds values and keeps sparkline window", () => {
  const s = parseScene({
    width: 100, height: 100,
    nodes: [
      { id: "g", type: "gauge", x: 0, y: 0, r: 10, value: 1, bind: "k" },
      { id: "s", type: "sparkline", x: 0, y: 0, w: 10, h: 10, values: [1, 2], maxPoints: 2, bind: "k" },
      { id: "t", type: "text", x: 0, y: 0, text: "v={value}", bind: "k" },
    ],
  });
  const out = applyData(s, { k: 42.26 });
  assert.equal((out.nodes[0] as any).value, 42.26);
  assert.deepEqual((out.nodes[1] as any).values, [2, 42.26]);
  assert.equal((out.nodes[2] as any).value, 42.26);
  assert.equal((s.nodes[0] as any).value, 1, "input scene is not mutated");
});

test("gridLayout centers nodes in cells", () => {
  const s = parseScene({ width: 300, height: 100, nodes: [
    { id: "a", type: "circle", x: 0, y: 0, r: 10 }, { id: "b", type: "circle", x: 0, y: 0, r: 10 },
  ] });
  const out = gridLayout(s, ["a", "b"], { columns: 2, padding: 0, top: 0 });
  assert.deepEqual([out.nodes[0].x, out.nodes[1].x], [75, 225]);
});
