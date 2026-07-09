// Función serverless de Vercel: envuelve la app Express (compilada en dist/).
// vercel.json reescribe todo /api/* aquí; Express ve la ruta original y la enruta.
import { buildApp } from "../dist/api/server.js";

const app = buildApp();

export default function handler(req, res) {
  return app(req, res);
}
