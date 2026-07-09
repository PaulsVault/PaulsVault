import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// En dev, Vite proxea /api al backend Express (npm start, puerto 3000).
// En prod, el backend sirve web/dist directamente.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
