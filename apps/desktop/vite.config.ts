import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@aimarketing/workbench-ui": resolve(__dirname, "../../packages/workbench-ui/src/index.ts") } },
  clearScreen: false,
  server: { strictPort: true, port: 1420 },
  build: { outDir: "dist", emptyOutDir: true },
});
