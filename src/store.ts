// Persistencia en libSQL (@libsql/client): archivo local en dev/tests, Turso por red en prod.
// - Personajes: por usuario (owner_id vía AsyncLocalStorage), I/O asíncrono en la capa API.
// - Contenido: SRD empaquetado (archivos, síncrono) + homebrew global en DB con caché en memoria,
//   de modo que listPacks() sigue siendo SÍNCRONO y el dominio no cambia.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { AsyncLocalStorage } from "node:async_hooks";
import { createClient, type Client } from "@libsql/client";
import type { Character, ContentPack, Database } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, "data");

function dbUrl(): string {
  if (process.env["TURSO_DATABASE_URL"]) return process.env["TURSO_DATABASE_URL"];
  if (process.env["DND_DB"]) return process.env["DND_DB"];
  const dir = process.env["DND_DATA_DIR"] ? path.resolve(process.env["DND_DATA_DIR"]) : path.join(os.homedir(), ".dnd-mcp");
  fs.mkdirSync(dir, { recursive: true });
  return "file:" + path.join(dir, "app.db").replace(/\\/g, "/");
}

let _client: Client | null = null;
function client(): Client {
  if (!_client) _client = createClient({ url: dbUrl(), authToken: process.env["TURSO_AUTH_TOKEN"] });
  return _client;
}

let _ready: Promise<void> | null = null;
function ready(): Promise<void> {
  if (!_ready) _ready = (async () => {
    const c = client();
    await c.execute("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TEXT)");
    await c.execute("CREATE TABLE IF NOT EXISTS characters (id TEXT PRIMARY KEY, owner_id TEXT, data TEXT NOT NULL, updated_at TEXT)");
    await c.execute("CREATE TABLE IF NOT EXISTS content_packs (id TEXT PRIMARY KEY, data TEXT NOT NULL)");
    await refreshPacks();
  })();
  return _ready;
}

// ─── Contexto de dueño (personajes) ───
export const requestContext = new AsyncLocalStorage<{ ownerId: string | null }>();
export function runAsOwner<T>(ownerId: string | null, fn: () => T | Promise<T>): T | Promise<T> {
  return requestContext.run({ ownerId }, fn);
}
function owner(): string | null {
  return requestContext.getStore()?.ownerId ?? null;
}

/** Debe llamarse una vez antes de servir peticiones (crea el esquema y carga los packs). */
export function init(): Promise<void> {
  return ready();
}

// ─── Content packs: SRD empaquetado (sync) + homebrew global en DB (caché) ───
let _bundled: ContentPack[] | null = null;
function bundled(): ContentPack[] {
  if (_bundled) return _bundled;
  const packs: ContentPack[] = [];
  if (fs.existsSync(SEED_DIR)) {
    for (const f of fs.readdirSync(SEED_DIR)) {
      if (!f.endsWith(".json")) continue;
      try { packs.push(JSON.parse(fs.readFileSync(path.join(SEED_DIR, f), "utf-8")) as ContentPack); } catch { /* ignora */ }
    }
  }
  _bundled = packs;
  return packs;
}

let _dbPacks: ContentPack[] = [];
async function refreshPacks(): Promise<void> {
  const rs = await client().execute("SELECT data FROM content_packs");
  _dbPacks = [];
  for (const r of rs.rows) {
    try { _dbPacks.push(JSON.parse(r["data"] as string) as ContentPack); } catch { /* ignora */ }
  }
}

export function listPacks(): ContentPack[] {
  return [...bundled(), ..._dbPacks];
}

export async function savePack(pack: ContentPack): Promise<void> {
  await ready();
  await client().execute({
    sql: "INSERT INTO content_packs (id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data",
    args: [pack.id, JSON.stringify(pack)],
  });
  await refreshPacks();
}

export async function deletePack(packId: string): Promise<boolean> {
  await ready();
  const info = await client().execute({ sql: "DELETE FROM content_packs WHERE id = ?", args: [packId] });
  await refreshPacks();
  return Number(info.rowsAffected ?? 0) > 0;
}

// ─── Personajes (scoped por dueño) ───

export async function loadDb(): Promise<Database> {
  await ready();
  const rs = await client().execute({ sql: "SELECT data FROM characters WHERE owner_id IS ? ORDER BY updated_at DESC", args: [owner()] });
  return { characters: rs.rows.map((r) => JSON.parse(r["data"] as string) as Character) };
}

export async function saveDb(database: Database): Promise<void> {
  await ready();
  const c = client();
  const own = owner();
  const rs = await c.execute({ sql: "SELECT id FROM characters WHERE owner_id IS ?", args: [own] });
  const ids = new Set(database.characters.map((ch) => ch.id));
  const stmts: { sql: string; args: (string | null)[] }[] = [];
  for (const ch of database.characters) {
    stmts.push({
      sql: "INSERT INTO characters (id, owner_id, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
      args: [ch.id, own, JSON.stringify(ch), ch.updatedAt ?? new Date().toISOString()],
    });
  }
  for (const row of rs.rows) {
    const rid = row["id"] as string;
    if (!ids.has(rid)) stmts.push({ sql: "DELETE FROM characters WHERE id = ? AND owner_id IS ?", args: [rid, own] });
  }
  if (stmts.length) await c.batch(stmts, "write");
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

// ─── Usuarios ───

export interface UserRow { id: string; email: string; password_hash: string; created_at: string; }

export async function createUser(id: string, email: string, passwordHash: string): Promise<void> {
  await ready();
  await client().execute({
    sql: "INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
    args: [id, email.toLowerCase(), passwordHash, new Date().toISOString()],
  });
}

export async function getUserByEmail(email: string): Promise<UserRow | undefined> {
  await ready();
  const rs = await client().execute({ sql: "SELECT id, email, password_hash, created_at FROM users WHERE email = ?", args: [email.toLowerCase()] });
  return rs.rows[0] as unknown as UserRow | undefined;
}

export async function getUserById(id: string): Promise<UserRow | undefined> {
  await ready();
  const rs = await client().execute({ sql: "SELECT id, email, password_hash, created_at FROM users WHERE id = ?", args: [id] });
  return rs.rows[0] as unknown as UserRow | undefined;
}

export function dataDir(): string {
  return dbUrl();
}
