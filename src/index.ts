#!/usr/bin/env node
// Punto de entrada de la app: servidor Express (API REST + SPA). Sin MCP.
import { buildApp } from "./api/server.js";

const port = parseInt(process.env.PORT ?? "3000", 10);

buildApp().listen(port, () => {
  console.log(`D&D app escuchando en http://localhost:${port}  (API en /api)`);
});
