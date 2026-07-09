// Persistencia en SQLite (node:sqlite, síncrono e integrado en Node 24 — sin dependencias).
// Multi-tenant: el "dueño" actual viaja por petición vía AsyncLocalStorage (lo fija la API con
// el usuario de la sesión). El dominio no cambia; los tests corren sin contexto (dueño = null).

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import type { Character, ContentPack, Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env["DND_DATA_DIR"]
  ? path.resolve(process.env["DND_DATA_DIR"])
  : path.join(os.homedir(), ".dnd-mcp");

const DB_FILE = process.env["DND_DB"] ?? path.join(DATA_DIR, "app.db");
const SEED_DIR = path.join(__dirname, "data");

// ─── Contexto por petición (dueño de los datos) ───
interface RequestCtx { ownerId: string | null; }
export const requestContext = new AsyncLocalStorage<RequestCtx>();
export function runAsOwner<T>(ownerId: string | null, fn: () => T): T {
  return requestContext.run({ ownerId }, fn);
}
function owner(): string | null {
  return requestContext.getStore()?.ownerId ?? null;
}

let _db: DatabaseSync | null = null;

function db(): DatabaseSync {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const d = new DatabaseSync(DB_FILE);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT
    );
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      owner_id TEXT,
      data TEXT NOT NULL,
      updated_at TEXT
    );
    CREATE TABLE IF NOT EXISTS content_packs (
      pk INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id TEXT,
      id TEXT NOT NULL,
      data TEXT NOT NULL,
      UNIQUE(owner_id, id)
    );
  `);
  _db = d;
  seedPacks();
  return d;
}

/** Siembra los packs globales incluidos (owner_id NULL) que aún no existan. */
function seedPacks(): void {
  if (!fs.existsSync(SEED_DIR)) return;
  const exists = _db!.prepare("SELECT pk FROM content_packs WHERE owner_id IS NULL AND id = ?");
  const insert = _db!.prepare("INSERT INTO content_packs (owner_id, id, data) VALUES (NULL, ?, ?)");
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

// ─── Usuarios ───

export interface UserRow { id: string; email: string; password_hash: string; created_at: string; }

export function createUser(id: string, email: string, passwordHash: string): void {
  db().prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)")
    .run(id, email.toLowerCase(), passwordHash, new Date().toISOString());
}

export function getUserByEmail(email: string): UserRow | undefined {
  return db().prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?").get(email.toLowerCase()) as UserRow | undefined;
}

export function getUserById(id: string): UserRow | undefined {
  return db().prepare("SELECT id, email, password_hash, created_at FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

// ─── Personajes (scoped por dueño) ───

export function loadDb(): Database {
  const rows = db().prepare("SELECT data FROM characters WHERE owner_id IS ? ORDER BY updated_at DESC").all(owner()) as { data: string }[];
  return { characters: rows.map((r) => JSON.parse(r.data) as Character) };
}

export function saveDb(database: Database): void {
  const d = db();
  const own = owner();
  const ids = new Set(database.characters.map((c) => c.id));
  const existing = d.prepare("SELECT id FROM characters WHERE owner_id IS ?").all(own) as { id: string }[];
  const upsert = d.prepare(
    "INSERT INTO characters (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
  );
  const del = d.prepare("DELETE FROM characters WHERE id = ? AND owner_id IS ?");
  d.exec("BEGIN");
  try {
    for (const c of database.characters) upsert.run(c.id, own, JSON.stringify(c), c.updatedAt ?? new Date().toISOString());
    for (const row of existing) if (!ids.has(row.id)) del.run(row.id, own);
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

// ─── Content packs (globales NULL + los del dueño) ───

export function listPacks(): ContentPack[] {
  const rows = db().prepare("SELECT data FROM content_packs WHERE owner_id IS NULL OR owner_id IS ?").all(owner()) as { data: string }[];
  const packs: ContentPack[] = [];
  for (const r of rows) {
    try { packs.push(JSON.parse(r.data) as ContentPack); } catch { /* pack corrupto: ignora */ }
  }
  return packs;
}

export function savePack(pack: ContentPack): void {
  const d = db();
  const own = owner();
  const existing = d.prepare("SELECT pk FROM content_packs WHERE owner_id IS ? AND id = ?").get(own, pack.id) as { pk: number } | undefined;
  if (existing) d.prepare("UPDATE content_packs SET data = ? WHERE pk = ?").run(JSON.stringify(pack), existing.pk);
  else d.prepare("INSERT INTO content_packs (owner_id, id, data) VALUES (?, ?, ?)").run(own, pack.id, JSON.stringify(pack));
}

export function deletePack(packId: string): boolean {
  // Solo borra un pack del dueño actual (no los globales, salvo contexto sin dueño).
  const info = db().prepare("DELETE FROM content_packs WHERE owner_id IS ? AND id = ?").run(owner(), packId);
  return info.changes > 0;
}

export function dataDir(): string {
  return path.dirname(DB_FILE);
}
