import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import CanvasKitInit from "canvaskit-wasm";
import type { CanvasKit } from "canvaskit-wasm";
import { SceneRenderer, type Scene } from "@skia-scene/core";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const fontsDir = join(here, "../../web/public/fonts");

let cached: Promise<{ ck: CanvasKit; renderer: SceneRenderer }> | undefined;

/** Load CanvasKit (Skia compiled to WASM) and the fonts once per process. */
export function loadSkia() {
  cached ??= (async () => {
    const wasmDir = dirname(require.resolve("canvaskit-wasm/bin/canvaskit.wasm"));
    const ck = await CanvasKitInit({ locateFile: (f: string) => join(wasmDir, f) });
    const [reg, semi] = await Promise.all([
      readFile(join(fontsDir, "Inter-Regular.otf")),
      readFile(join(fontsDir, "Inter-SemiBold.otf")),
    ]);
    const regular = ck.Typeface.MakeFreeTypeFaceFromData(reg.buffer.slice(reg.byteOffset, reg.byteOffset + reg.byteLength));
    const semibold = ck.Typeface.MakeFreeTypeFaceFromData(semi.buffer.slice(semi.byteOffset, semi.byteOffset + semi.byteLength));
    if (!regular || !semibold) throw new Error("Could not load fonts");
    return { ck, renderer: new SceneRenderer(ck, { regular, semibold }) };
  })();
  return cached;
}

/** Render a scene to PNG bytes on a CPU surface (no GPU needed, works on servers). */
export async function renderPng(scene: Scene): Promise<Uint8Array> {
  const { ck, renderer } = await loadSkia();
  const surface = ck.MakeSurface(scene.width, scene.height);
  if (!surface) throw new Error("Could not create Skia surface");
  try {
    renderer.render(surface.getCanvas(), scene);
    surface.flush();
    const img = surface.makeImageSnapshot();
    const png = img.encodeToBytes();
    img.delete();
    if (!png) throw new Error("PNG encoding failed");
    return png;
  } finally {
    surface.delete();
  }
}
