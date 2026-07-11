// Copia los assets de @3d-dice/dice-box (ammo.wasm, temas, modelos) a public/ para que Vite los sirva.
// Se ejecuta antes de dev y build (predev/prebuild). Los assets NO se commitean (se regeneran de node_modules).
import fs from "node:fs";
import path from "node:path";

const src = path.resolve("node_modules/@3d-dice/dice-box/dist/assets");
const dst = path.resolve("public/assets/dice-box");

if (!fs.existsSync(src)) {
  console.warn("[dice] assets de dice-box no encontrados en node_modules; ¿instalaste las dependencias?");
  process.exit(0);
}
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.cpSync(src, dst, { recursive: true });
console.log("[dice] assets de dice-box copiados a public/assets/dice-box");
