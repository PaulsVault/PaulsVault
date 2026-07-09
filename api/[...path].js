// Punto de entrada serverless para Vercel: envuelve la app Express (compilada en dist/).
// Catch-all: todas las rutas /api/* pasan por aquí. El frontend estático lo sirve Vercel (web/dist).
import { buildApp } from "../dist/api/server.js";

const app = buildApp();

export default function handler(req, res) {
  return app(req, res);
}
