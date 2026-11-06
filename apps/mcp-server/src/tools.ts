import { z } from "zod";
import { applyData, gridLayout, parseNode, type Scene } from "@skia-scene/core";
import type { SceneStore } from "./store.js";
import { renderPng } from "./skia-node.js";

type Content =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

export interface ToolDef {
  name: string;
  description: string;
  shape: z.ZodRawShape;
  run: (args: any) => Promise<Content[]>;
}

const text = (t: string): Content[] => [{ type: "text", text: t }];
const summary = (s: Scene) =>
  `${s.width}x${s.height}, ${s.nodes.length} nodes: ` +
  (s.nodes.map((n) => `${n.id}(${n.type})`).join(", ") || "none");

/** Tool definitions kept separate from the transport so they can be unit tested. */
export function buildTools(store: SceneStore): ToolDef[] {
  return [
    {
      name: "new_scene",
      description: "Start a new empty scene (clears all nodes).",
      shape: {
        width: z.number().int().min(100).max(4096).default(960),
        height: z.number().int().min(100).max(4096).default(540),
        background: z.string().default("#0f172a"),
      },
      run: async (a) => {
        const s = await store.update(() => ({ version: 1, width: a.width, height: a.height, background: a.background, nodes: [] }));
        return text(`Created scene ${summary(s)}`);
      },
    },
    {
      name: "get_scene",
      description: "Return the full scene JSON so you can see what is on the canvas.",
      shape: {},
      run: async () => text(JSON.stringify(await store.load(), null, 2)),
    },
    {
      name: "add_node",
      description:
        "Add one node. Types: rect, circle, line, text, gauge, bar, sparkline. " +
        "Pass the node as JSON, e.g. {\"id\":\"temp\",\"type\":\"gauge\",\"x\":200,\"y\":200,\"r\":80,\"value\":42,\"label\":\"Temp\",\"units\":\"°C\"}. " +
        "Use `bind` to connect it to a live data key and `thresholds` [{at,color}] for alarm colors.",
      shape: { node: z.record(z.any()) },
      run: async (a) => {
        const node = parseNode(a.node);
        const s = await store.update((sc) => {
          if (sc.nodes.some((n) => n.id === node.id)) throw new Error(`Node "${node.id}" already exists; use update_node`);
          return { ...sc, nodes: [...sc.nodes, node] };
        });
        return text(`Added ${node.id}. Scene: ${summary(s)}`);
      },
    },
    {
      name: "update_node",
      description: "Change fields of an existing node, e.g. {\"id\":\"temp\",\"changes\":{\"value\":88}}.",
      shape: { id: z.string(), changes: z.record(z.any()) },
      run: async (a) => {
        const s = await store.update((sc) => {
          const i = sc.nodes.findIndex((n) => n.id === a.id);
          if (i < 0) throw new Error(`No node "${a.id}"`);
          const merged = parseNode({ ...sc.nodes[i], ...a.changes, id: a.id });
          const nodes = [...sc.nodes];
          nodes[i] = merged;
          return { ...sc, nodes };
        });
        return text(`Updated ${a.id}. Scene: ${summary(s)}`);
      },
    },
    {
      name: "remove_node",
      description: "Delete a node by id.",
      shape: { id: z.string() },
      run: async (a) => {
        const s = await store.update((sc) => ({ ...sc, nodes: sc.nodes.filter((n) => n.id !== a.id) }));
        return text(`Removed ${a.id}. Scene: ${summary(s)}`);
      },
    },
    {
      name: "layout_grid",
      description: "Arrange nodes into an evenly spaced grid, e.g. 6 gauges in 3 columns.",
      shape: { ids: z.array(z.string()).min(1), columns: z.number().int().min(1).max(12), top: z.number().optional() },
      run: async (a) => {
        const s = await store.update((sc) => gridLayout(sc, a.ids, { columns: a.columns, top: a.top }));
        return text(`Arranged ${a.ids.length} nodes in ${a.columns} columns. Scene: ${summary(s)}`);
      },
    },
    {
      name: "render_png",
      description:
        "Render the scene with Skia and return the image, so you can check your layout visually. " +
        "Optionally pass sample data, e.g. {\"pump1.pressure\": 91}, to preview alarm colors.",
      shape: { data: z.record(z.number()).optional() },
      run: async (a) => {
        let s = await store.load();
        if (a.data) s = applyData(s, a.data);
        const png = await renderPng(s);
        return [
          { type: "image", data: Buffer.from(png).toString("base64"), mimeType: "image/png" },
          { type: "text", text: `Rendered ${summary(s)}` },
        ];
      },
    },
  ];
}
