#!/usr/bin/env -S npx tsx
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SceneStore } from "./store.js";
import { buildTools } from "./tools.js";

const here = dirname(fileURLToPath(import.meta.url));
// Default to the web app's public folder so the browser editor shows changes live.
const scenePath = resolve(process.env.SKIA_SCENE_FILE ?? join(here, "../../web/public/scene.json"));

const server = new McpServer({ name: "skia-scene", version: "0.1.0" });
const store = new SceneStore(scenePath);

for (const tool of buildTools(store)) {
  server.tool(tool.name, tool.description, tool.shape, async (args) => {
    try {
      return { content: await tool.run(args) };
    } catch (e) {
      // Return errors to the model as text so it can correct itself instead of crashing.
      return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], isError: true };
    }
  });
}

await server.connect(new StdioServerTransport());
// stdout is the MCP channel, so log to stderr only.
console.error(`skia-scene MCP server ready. Scene file: ${scenePath}`);
