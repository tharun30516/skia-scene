import { z } from "zod";

/** Hex color like #1e90ff or #1e90ffcc. */
const Color = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "Use a hex color like #1e90ff");

/** Changes a node's color once a bound value reaches `at`. */
export const Threshold = z.object({ at: z.number(), color: Color });

const Base = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  rotation: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
  /** Data key this node is bound to, e.g. "pump1.pressure". */
  bind: z.string().optional(),
};

export const RectNode = z.object({
  ...Base,
  type: z.literal("rect"),
  w: z.number().positive(),
  h: z.number().positive(),
  radius: z.number().min(0).default(0),
  fill: Color.default("#2a2f3a"),
  stroke: Color.optional(),
  strokeWidth: z.number().min(0).default(1),
  thresholds: z.array(Threshold).default([]),
  value: z.number().optional(),
});

export const CircleNode = z.object({
  ...Base,
  type: z.literal("circle"),
  r: z.number().positive(),
  fill: Color.default("#3b82f6"),
  stroke: Color.optional(),
  strokeWidth: z.number().min(0).default(1),
  thresholds: z.array(Threshold).default([]),
  value: z.number().optional(),
});

export const LineNode = z.object({
  ...Base,
  type: z.literal("line"),
  x2: z.number(),
  y2: z.number(),
  stroke: Color.default("#94a3b8"),
  strokeWidth: z.number().positive().default(2),
  dashed: z.boolean().default(false),
});

export const TextNode = z.object({
  ...Base,
  type: z.literal("text"),
  text: z.string(),
  size: z.number().positive().default(16),
  color: Color.default("#e2e8f0"),
  weight: z.enum(["regular", "semibold"]).default("regular"),
  align: z.enum(["left", "center", "right"]).default("left"),
  value: z.number().optional(),
});

export const GaugeNode = z.object({
  ...Base,
  type: z.literal("gauge"),
  r: z.number().positive(),
  value: z.number(),
  min: z.number().default(0),
  max: z.number().default(100),
  label: z.string().optional(),
  units: z.string().default(""),
  color: Color.default("#22c55e"),
  thresholds: z.array(Threshold).default([]),
});

export const BarNode = z.object({
  ...Base,
  type: z.literal("bar"),
  w: z.number().positive(),
  h: z.number().positive(),
  value: z.number(),
  min: z.number().default(0),
  max: z.number().default(100),
  color: Color.default("#38bdf8"),
  thresholds: z.array(Threshold).default([]),
});

export const SparklineNode = z.object({
  ...Base,
  type: z.literal("sparkline"),
  w: z.number().positive(),
  h: z.number().positive(),
  values: z.array(z.number()).default([]),
  maxPoints: z.number().int().positive().default(60),
  color: Color.default("#a78bfa"),
});

export const Node = z.discriminatedUnion("type", [
  RectNode,
  CircleNode,
  LineNode,
  TextNode,
  GaugeNode,
  BarNode,
  SparklineNode,
]);

export const Scene = z.object({
  version: z.literal(1).default(1),
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
  background: Color.default("#0f172a"),
  nodes: z.array(Node).default([]),
});

export type Threshold = z.infer<typeof Threshold>;
export type SceneNode = z.infer<typeof Node>;
export type Scene = z.infer<typeof Scene>;
export type NodeType = SceneNode["type"];

/** Parse and fill defaults; throws a readable error if invalid. */
export function parseScene(input: unknown): Scene {
  const r = Scene.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "scene"}: ${i.message}`).join("; ");
    throw new Error(`Invalid scene: ${msg}`);
  }
  const ids = new Set<string>();
  for (const n of r.data.nodes) {
    if (ids.has(n.id)) throw new Error(`Invalid scene: duplicate node id "${n.id}"`);
    ids.add(n.id);
  }
  return r.data;
}

export function parseNode(input: unknown): SceneNode {
  const r = Node.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join(".") || "node"}: ${i.message}`).join("; ");
    throw new Error(`Invalid node: ${msg}`);
  }
  return r.data;
}
