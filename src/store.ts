// Persistencia en SQLite (node:sqlite, síncrono e integrado en Node 24 — sin dependencias
// ni módulos nativos). Interfaz idéntica a la anterior (loadDb/saveDb/listPacks/...), así que
// el dominio y la API no cambian. Esquema con owner_id preparado para multi-tenant (aún sin forzar).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import type { Character, ContentPack, Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env["DND_DATA_DIR"]
  ? path.resolve(process.env["DND_DATA_DIR"])
  : path.join(os.homedir(), ".dnd-mcp");

const DB_FILE = process.env["DND_DB"] ?? path.join(DATA_DIR, "app.db");
const SEED_DIR = path.join(__dirname, "data");

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const d = new DatabaseSync(DB_FILE);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      data TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS content_packs (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      data TEXT NOT NULL
    );
  `);
  _db = d;
  seedPacks();
  return d;
}

/** Siembra los packs incluidos (srd-core, srd-52-reference…) que aún no existan. */
function seedPacks(): void {
  if (!fs.existsSync(SEED_DIR)) return;
  const exists = _db!.prepare("SELECT id FROM content_packs WHERE id = ?");
  const insert = _db!.prepare("INSERT OR IGNORE INTO content_packs (id, owner_id, data) VALUES (?, NULL, ?)");
  for (const f of fs.readdirSync(SEED_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const pack = JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), "utf-8")) as ContentPack;
      if (pack.id && !exists.get(pack.id)) insert.run(pack.id, JSON.stringify(pack));
    } catch {
      // pack semilla corrupto: se ignora
    }
  }
}

export function loadDb(): Database {
  const rows = db().prepare("SELECT data FROM characters ORDER BY updated_at DESC").all() as { data: string }[];
  return { characters: rows.map((r) => JSON.parse(r.data) as Character) };
}

export function saveDb(database: Database): void {
  const d = db();
  const ids = new Set(database.characters.map((c) => c.id));
  const existing = d.prepare("SELECT id FROM characters").all() as { id: string }[];
  const upsert = d.prepare(
    "INSERT INTO characters (id, owner_id, data, updated_at) VALUES (?, NULL, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  );
  const del = d.prepare("DELETE FROM characters WHERE id = ?");
  d.exec("BEGIN");
  try {
    for (const c of database.characters) upsert.run(c.id, JSON.stringify(c), c.updatedAt ?? new Date().toISOString());
    for (const row of existing) if (!ids.has(row.id)) del.run(row.id);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export function getCharacter(database: Database, idOrName: string): Character {
  const q = idOrName.trim().toLowerCase();
  const found =
    database.characters.find((c) => c.id === idOrName) ??
    database.characters.find((c) => c.name.toLowerCase() === q) ??
    database.characters.find((c) => c.name.toLowerCase().includes(q));
  if (!found) {
    const names = database.characters.map((c) => `"${c.name}" (${c.id})`).join(", ") || "ninguno";
    throw new Error(`Personaje "${idOrName}" no encontrado. Personajes existentes: ${names}.`);
  }
  return found;
}

export function touch(c: Character): void {
  c.updatedAt = new Date().toISOString();
}

// ─── Content packs ───

export function listPacks(): ContentPack[] {
  const rows = db().prepare("SELECT data FROM content_packs").all() as { data: string }[];
  const packs: ContentPack[] = [];
  for (const r of rows) {
    try { packs.push(JSON.parse(r.data) as ContentPack); } catch { /* pack corrupto: ignora */ }
  }
  return packs;
}

export function savePack(pack: ContentPack): void {
  db().prepare(
    "INSERT INTO content_packs (id, owner_id, data) VALUES (?, NULL, ?) " +
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data",
  ).run(pack.id, JSON.stringify(pack));
}

export function deletePack(packId: string): boolean {
  const info = db().prepare("DELETE FROM content_packs WHERE id = ?").run(packId);
  return info.changes > 0;
}

export function dataDir(): string {
  return path.dirname(DB_FILE);
}
