import CanvasKitInit from "canvaskit-wasm";
import wasmUrl from "canvaskit-wasm/bin/canvaskit.wasm?url";
import { applyData, parseNode, parseScene, SceneRenderer, type Scene, type SceneNode } from "@skia-scene/core";
import { DataSimulator } from "./simulator";
import { defaultsFor } from "./defaults";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvasEl = $<HTMLCanvasElement>("canvas");
const jsonEl = $<HTMLTextAreaElement>("json");
const errEl = $("err");

async function loadFont(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Font ${url}: ${r.status}`);
  return r.arrayBuffer();
}

const [ck, regBytes, semiBytes] = await Promise.all([
  CanvasKitInit({ locateFile: () => wasmUrl }),
  loadFont("/fonts/Inter-Regular.otf"),
  loadFont("/fonts/Inter-SemiBold.otf"),
]);
const renderer = new SceneRenderer(ck, {
  regular: ck.Typeface.MakeFreeTypeFaceFromData(regBytes)!,
  semibold: ck.Typeface.MakeFreeTypeFaceFromData(semiBytes)!,
});

// ---------------- state ----------------
let scene: Scene = parseScene({ width: 960, height: 540, nodes: [] });
let selectedId: string | undefined;
let lastRemote = "";
let dirty = true; // only redraw when something changed
const sim = new DataSimulator();

let surface = ck.MakeWebGLCanvasSurface(canvasEl);
function resize(s: Scene) {
  if (canvasEl.width === s.width && canvasEl.height === s.height && surface) return;
  canvasEl.width = s.width;
  canvasEl.height = s.height;
  surface?.delete();
  // Fall back to a software surface if WebGL is unavailable.
  surface = ck.MakeWebGLCanvasSurface(canvasEl) ?? ck.MakeSWCanvasSurface(canvasEl);
}

function setScene(next: Scene, opts: { fromRemote?: boolean } = {}) {
  scene = next;
  resize(scene);
  if (!opts.fromRemote || document.activeElement !== jsonEl) jsonEl.value = JSON.stringify(scene, null, 2);
  $<HTMLButtonElement>("delete").disabled = !scene.nodes.some((n) => n.id === selectedId);
  dirty = true;
}

// ---------------- render loop ----------------
let frames = 0;
let lastFpsAt = performance.now();
let lastDraw = 0;
function frame(now: number) {
  if ($<HTMLInputElement>("live").checked && now - lastDraw > 250) {
    sim.tick(scene);
    dirty = true;
  }
  if (dirty && surface) {
    const t0 = performance.now();
    const view = $<HTMLInputElement>("live").checked ? applyData(scene, sim.snapshot()) : scene;
    renderer.render(surface.getCanvas(), view, selectedId);
    surface.flush();
    lastDraw = now;
    dirty = false;
    frames++;
    if (now - lastFpsAt > 1000) {
      $("fps").textContent = `${frames} draws/s\n${(performance.now() - t0).toFixed(2)} ms/draw\n${scene.nodes.length} nodes`;
      frames = 0;
      lastFpsAt = now;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------- sync with the MCP server (it writes public/scene.json) ----------------
async function pollRemote() {
  if ($<HTMLInputElement>("sync").checked) {
    try {
      const r = await fetch(`/scene.json?t=${Date.now()}`, { cache: "no-store" });
      if (r.ok) {
        const text = await r.text();
        if (text !== lastRemote) {
          lastRemote = text;
          setScene(parseScene(JSON.parse(text)), { fromRemote: true });
        }
      }
    } catch {
      /* no scene yet: keep the local one */
    }
  }
  setTimeout(pollRemote, 1000);
}
pollRemote();

// ---------------- editing ----------------
function updateNode(id: string, fn: (n: SceneNode) => SceneNode) {
  setScene({ ...scene, nodes: scene.nodes.map((n) => (n.id === id ? parseNode(fn(n)) : n)) });
}

function toScene(e: PointerEvent) {
  const r = canvasEl.getBoundingClientRect();
  return { x: ((e.clientX - r.left) * canvasEl.width) / r.width, y: ((e.clientY - r.top) * canvasEl.height) / r.height };
}

let drag: { id: string; lx: number; ly: number } | undefined;
canvasEl.addEventListener("pointerdown", (e) => {
  const p = toScene(e);
  const hit = renderer.hitTest(scene, p.x, p.y);
  selectedId = hit?.id;
  if (hit) {
    drag = { id: hit.id, lx: p.x, ly: p.y };
    canvasEl.setPointerCapture(e.pointerId);
  }
  setScene(scene);
});
canvasEl.addEventListener("pointermove", (e) => {
  const p = toScene(e);
  if (!drag) {
    canvasEl.style.cursor = renderer.hitTest(scene, p.x, p.y) ? "move" : "default";
    return;
  }
  const dx = p.x - drag.lx;
  const dy = p.y - drag.ly;
  drag.lx = p.x;
  drag.ly = p.y;
  updateNode(drag.id, (n) => move(n, dx, dy));
});
canvasEl.addEventListener("pointerup", () => (drag = undefined));

function move(n: SceneNode, dx: number, dy: number): SceneNode {
  if (n.type === "line") return { ...n, x: n.x + dx, y: n.y + dy, x2: n.x2 + dx, y2: n.y2 + dy };
  return { ...n, x: n.x + dx, y: n.y + dy };
}

window.addEventListener("keydown", (e) => {
  if (document.activeElement === jsonEl || !selectedId) return;
  const step = e.shiftKey ? 10 : 1;
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (d[e.key]) {
    e.preventDefault();
    updateNode(selectedId, (n) => move(n, ...d[e.key]));
  } else if (e.key === "Delete" || e.key === "Backspace") {
    removeSelected();
  }
});

function removeSelected() {
  if (!selectedId) return;
  setScene({ ...scene, nodes: scene.nodes.filter((n) => n.id !== selectedId) });
  selectedId = undefined;
}
$("delete").addEventListener("click", removeSelected);

document.querySelectorAll<HTMLButtonElement>("[data-add]").forEach((btn) =>
  btn.addEventListener("click", () => {
    const type = btn.dataset.add as SceneNode["type"];
    let i = 1;
    while (scene.nodes.some((n) => n.id === `${type}${i}`)) i++;
    const node = parseNode(defaultsFor(type, `${type}${i}`, scene.width / 2, scene.height / 2));
    selectedId = node.id;
    setScene({ ...scene, nodes: [...scene.nodes, node] });
  }),
);

$("apply").addEventListener("click", () => {
  try {
    setScene(parseScene(JSON.parse(jsonEl.value)));
    errEl.textContent = "";
  } catch (e) {
    errEl.textContent = (e as Error).message;
  }
});

$("png").addEventListener("click", () => {
  const off = ck.MakeSurface(scene.width, scene.height)!;
  renderer.render(off.getCanvas(), applyData(scene, sim.snapshot()));
  const img = off.makeImageSnapshot();
  const bytes = img.encodeToBytes()!;
  img.delete();
  off.delete();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  a.download = "scene.png";
  a.click();
});

setScene(scene);
