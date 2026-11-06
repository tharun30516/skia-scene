import { defineConfig } from "vite";

export default defineConfig({
  // CanvasKit ships its own .wasm; don't let Vite pre-bundle it.
  optimizeDeps: { exclude: ["canvaskit-wasm"] },
  build: { target: "es2022" },
  server: { port: 5173 },
});
