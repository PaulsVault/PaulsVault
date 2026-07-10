// Importa los packs de data-private/ a la base de datos (upsert por id, reejecutable).
// Apunta a la MISMA base que usa la app:
//   - Producción (Turso): define TURSO_DATABASE_URL y TURSO_AUTH_TOKEN antes de correr.
//   - Local: usa el archivo por defecto (DND_DATA_DIR) si no hay Turso.
//
//   node scripts/import-packs.mjs
//
// Requiere compilar antes (npm run build) para que exista dist/store.js.

import fs from "node:fs";
import path from "node:path";

// Carga .env si existe (para TURSO_DATABASE_URL / TURSO_AUTH_TOKEN) sin exponerlo.
try { process.loadEnvFile(); } catch { /* sin .env: usa el entorno actual o la base local */ }

const { init, savePack, listPacks } = await import("../dist/store.js");

const DIR = path.resolve(process.env["DND_PACKS_DIR"] || "data-private");
if (!fs.existsSync(DIR)) {
  console.error(`No existe ${DIR}. Corre primero scripts/convert-5etools.mjs.`);
  process.exit(1);
}
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
if (files.length === 0) { console.error(`Sin packs en ${DIR}.`); process.exit(1); }

const target = process.env["TURSO_DATABASE_URL"] ? "Turso (producción)" : "base local";
console.log(`Importando ${files.length} pack(s) a ${target}…`);
await init();
for (const f of files) {
  const pack = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
  await savePack(pack);
  console.log(`  ✓ ${pack.id}: ${pack.entries.length} entradas`);
}
console.log("Biblioteca ahora:", listPacks().map((p) => `${p.id}(${p.entries.length})`).join(", "));
process.exit(0);
