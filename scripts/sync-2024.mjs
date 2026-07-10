// UN SOLO COMANDO para llevar TODO el contenido D&D 2024 a tu base de datos.
//
//   node scripts/sync-2024.mjs
//
// Antes, una sola vez: crea un archivo `.env` con TURSO_DATABASE_URL y TURSO_AUTH_TOKEN
// (copia `.env.example` a `.env` y pega tus valores de Vercel). Si no hay `.env`, sube a
// la base local en vez de a Turso.
//
// El script: descarga/actualiza los datos de 5etools, compila, los convierte a packs y los sube.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

try { process.loadEnvFile(); } catch { /* sin .env: usa el entorno o la base local */ }

const REPO = path.resolve(".5etools");
const DATA = path.join(REPO, "data");
const step = (n, msg) => console.log(`\n[${n}/4] ${msg}`);
const run = (cmd) => { console.log("  > " + cmd); execSync(cmd, { stdio: "inherit" }); };

step(1, "Descargando los datos de D&D 2024 desde 5etools…");
if (!fs.existsSync(path.join(REPO, ".git"))) {
  run(`git clone --depth 1 --filter=blob:none --sparse https://github.com/5etools-mirror-3/5etools-src.git "${REPO}"`);
  run(`git -C "${REPO}" sparse-checkout set data`);
} else {
  run(`git -C "${REPO}" pull`);
}

step(2, "Compilando la app…");
run("npm run build");

step(3, "Convirtiendo el contenido al formato de la app…");
run(`node scripts/convert-5etools.mjs "${DATA}"`);

const target = process.env["TURSO_DATABASE_URL"] ? "tu base Turso (producción)" : "la base local (no hay .env con Turso)";
step(4, `Subiendo el contenido a ${target}…`);
run("node scripts/import-packs.mjs");

console.log("\n✅ ¡Listo! Todo el contenido 2024 está cargado. Abre la app y recarga con Ctrl+Shift+R.");
