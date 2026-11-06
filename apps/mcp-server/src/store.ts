import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseScene, type Scene } from "@skia-scene/core";

/**
 * Persists the current scene as a JSON file. The web editor polls the same file,
 * so whatever the agent builds shows up live in the browser.
 * Writes are atomic (temp file + rename) so the editor never reads half a file.
 */
export class SceneStore {
  constructor(private path: string) {}

  async load(): Promise<Scene> {
    try {
      return parseScene(JSON.parse(await readFile(this.path, "utf8")));
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        return parseScene({ width: 960, height: 540, nodes: [] });
      }
      throw e;
    }
  }

  async save(scene: Scene): Promise<void> {
    const valid = parseScene(scene);
    await mkdir(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(valid, null, 2));
    await rename(tmp, this.path);
  }

  /** Load, change, validate and save in one step. */
  async update(fn: (s: Scene) => Scene): Promise<Scene> {
    const next = parseScene(fn(await this.load()));
    await this.save(next);
    return next;
  }
}
