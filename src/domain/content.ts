// Dominio de contenido: lectura, búsqueda y gestión de content packs.
// La biblioteca es ILIMITADA: cualquier cantidad de packs y entradas de cualquier tipo.
// Actualizar contenido = reimportar un pack con el mismo id (savePack sobreescribe).

import { listPacks, savePack, deletePack } from "../store.js";
import { DomainError } from "./errors.js";
import type { ContentEntry, ContentPack, ContentType } from "../types.js";

export type PackedEntry = ContentEntry & { pack: string };

export const CONTENT_TYPES: ContentType[] = [
  "class", "subclass", "species", "background", "feat", "spell", "item", "condition", "monster", "rule", "optionalfeature", "classfeature",
];

export function allEntries(): PackedEntry[] {
  return listPacks().flatMap((p) => p.entries.map((e) => ({ ...e, pack: p.id })));
}

/** Prioridad al colisionar nombres entre packs (mayor gana). El pack "homebrew" del usuario gana a todo
 * (permite ajustar/override de contenido oficial); otros packs importados van sobre el SRD y bajo 2024. */
function packPriority(packId: string): number {
  if (packId === "homebrew") return 5; // ediciones propias del usuario: siempre ganan
  if (packId.startsWith("dnd2024")) return 4;
  if (packId === "srd-52-reference") return 2;
  if (packId === "srd-core" || packId === "srd-subclasses") return 1;
  return 3; // otros packs importados por encima del SRD, por debajo de 2024
}

/** De entradas con el mismo (tipo, nombre) conserva solo la del pack de mayor prioridad. */
function dedupeByName(entries: PackedEntry[]): PackedEntry[] {
  const best = new Map<string, PackedEntry>();
  for (const e of entries) {
    const key = `${e.type}:${e.name.toLowerCase()}`;
    const cur = best.get(key);
    if (!cur || packPriority(e.pack) > packPriority(cur.pack)) best.set(key, e);
  }
  return [...best.values()];
}

/** Busca por id exacto, luego por nombre exacto, luego por coincidencia parcial; prefiere el pack de mayor prioridad. */
export function findEntry(idOrName: string, type?: ContentType): PackedEntry | undefined {
  const q = idOrName.trim().toLowerCase();
  const pool = allEntries().filter((e) => !type || e.type === type);
  const byId = pool.find((e) => e.id === idOrName);
  if (byId) return byId;
  const best = (matches: PackedEntry[]) =>
    matches.length ? matches.reduce((a, b) => (packPriority(b.pack) > packPriority(a.pack) ? b : a)) : undefined;
  return best(pool.filter((e) => e.name.toLowerCase() === q)) ?? best(pool.filter((e) => e.name.toLowerCase().includes(q)));
}

export interface SearchOptions {
  type?: ContentType;
  spellLevel?: number;
  spellClass?: string;
  subclassOf?: string;   // filtra subclases por su clase (data.class), no por texto
  featCategory?: string; // filtra dotes por categoría (O=origen, G=general, FS=estilo de combate, EB=don épico)
  limit?: number;
}

export interface SearchHit { id: string; type: ContentType; name: string; pack: string; preview?: string; }

export function searchContent(query = "", opts: SearchOptions = {}): { total: number; count: number; results: SearchHit[] } {
  const q = query.trim().toLowerCase();
  let pool = dedupeByName(allEntries()); // sin duplicados 2024/SRD; conserva el de mayor prioridad
  if (opts.type) pool = pool.filter((e) => e.type === opts.type);
  if (opts.spellLevel !== undefined) pool = pool.filter((e) => e.type === "spell" && e.data["level"] === opts.spellLevel);
  if (opts.spellClass) {
    const sc = opts.spellClass.toLowerCase();
    pool = pool.filter((e) => e.type === "spell" && Array.isArray(e.data["classes"]) && (e.data["classes"] as string[]).some((c) => c.toLowerCase() === sc));
  }
  if (opts.subclassOf) {
    const cn = opts.subclassOf.toLowerCase();
    pool = pool
      .filter((e) => e.type === "subclass" && String(e.data["class"] ?? "").toLowerCase() === cn)
      .sort((a, b) => a.name.localeCompare(b.name)); // orden alfabético estable (antes salían desordenadas)
  }
  if (opts.featCategory) {
    const fc = opts.featCategory.toLowerCase();
    pool = pool.filter((e) => e.type === "feat" && String(e.data["category"] ?? "").toLowerCase() === fc);
  }
  if (q) {
    // Prioriza coincidencias por nombre sobre las que solo aparecen en la descripción.
    const nameHits = pool.filter((e) => e.name.toLowerCase().includes(q));
    const dataHits = pool.filter((e) => !e.name.toLowerCase().includes(q) && JSON.stringify(e.data).toLowerCase().includes(q));
    pool = [...nameHits, ...dataHits];
  }
  const limit = opts.limit ?? 25;
  const results: SearchHit[] = pool.slice(0, limit).map((e) => ({
    id: e.id, type: e.type, name: e.name, pack: e.pack,
    preview: typeof e.data["summary"] === "string" ? (e.data["summary"] as string).slice(0, 120) : undefined,
  }));
  return { total: pool.length, count: results.length, results };
}

export interface SpellCard { name: string; level: number; school: string; classes: string[]; summary: string; ritual: boolean; concentration: boolean; }

export interface MonsterCard { name: string; cr: string; crNum: number; type: string; size: string; ac: number; hp: number; }
const crToNum = (cr: string) => (cr === "1/8" ? 0.125 : cr === "1/4" ? 0.25 : cr === "1/2" ? 0.5 : Number(cr) || 0);

/** Catálogo ligero de monstruos para el bestiario del DM (el stat block completo se pide con getEntry). */
export function monsterCatalog(): MonsterCard[] {
  return dedupeByName(allEntries())
    .filter((e) => e.type === "monster")
    .map((e) => ({
      name: e.name,
      cr: String(e.data["cr"] ?? "0"),
      crNum: crToNum(String(e.data["cr"] ?? "0")),
      type: String(e.data["creatureType"] ?? "—"),
      size: String(e.data["size"] ?? "—"),
      ac: Number(e.data["ac"] ?? 10),
      hp: Number((e.data["hp"] as { average?: number } | undefined)?.average ?? 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Catálogo de conjuros con datos completos, para el navegador de conjuros (por nivel/escuela/clase). */
export function spellCatalog(opts: { spellClass?: string } = {}): SpellCard[] {
  let pool = dedupeByName(allEntries()).filter((e) => e.type === "spell");
  if (opts.spellClass) {
    const sc = opts.spellClass.toLowerCase();
    pool = pool.filter((e) => Array.isArray(e.data["classes"]) && (e.data["classes"] as string[]).some((c) => c.toLowerCase() === sc));
  }
  return pool
    .map((e) => ({
      name: e.name,
      level: (e.data["level"] as number) ?? 0,
      school: (e.data["school"] as string) ?? "",
      classes: (e.data["classes"] as string[]) ?? [],
      summary: (e.data["summary"] as string) ?? "",
      ritual: !!e.data["ritual"],
      concentration: !!e.data["concentration"],
    }))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}

export function getContentEntry(idOrName: string, type?: ContentType): PackedEntry {
  const e = findEntry(idOrName, type);
  if (!e) throw new DomainError("not_found", `Entrada "${idOrName}" no encontrada.`);
  return e;
}

/** Importa o actualiza un content pack (mismo id = actualización). Biblioteca sin límites. */
export async function importPack(pack: ContentPack): Promise<{ imported: true; packId: string; entryCount: number }> {
  if (!pack.id || !pack.name || !Array.isArray(pack.entries) || pack.entries.length === 0) {
    throw new DomainError("validation", "El pack debe tener id, name y al menos una entrada.");
  }
  for (const e of pack.entries) {
    if (!e.id || !e.name || !CONTENT_TYPES.includes(e.type)) {
      throw new DomainError("validation", `Entrada inválida en el pack: cada entrada necesita id, name y type válido (${CONTENT_TYPES.join(", ")}).`);
    }
  }
  await savePack(pack);
  return { imported: true, packId: pack.id, entryCount: pack.entries.length };
}

/** Guarda una entrada en el pack "homebrew" del usuario (upsert por id; crea el pack si no existe). */
export async function saveHomebrewEntry(entry: ContentEntry): Promise<{ saved: true; id: string }> {
  if (!entry.id || !entry.name || !CONTENT_TYPES.includes(entry.type)) {
    throw new DomainError("validation", "La entrada homebrew necesita id, name y type válido.");
  }
  const existing = listPacks().find((p) => p.id === "homebrew");
  const entries = (existing?.entries ?? []).filter((e) => e.id !== entry.id);
  entries.push(entry);
  await savePack({ id: "homebrew", name: "Homebrew", version: "1.0.0", source: "Homebrew (usuario)", entries });
  return { saved: true, id: entry.id };
}

/** Elimina una entrada del pack homebrew (por id). */
export async function deleteHomebrewEntry(entryId: string): Promise<{ removed: boolean; id: string }> {
  const existing = listPacks().find((p) => p.id === "homebrew");
  if (!existing) return { removed: false, id: entryId };
  const entries = existing.entries.filter((e) => e.id !== entryId);
  if (entries.length === existing.entries.length) return { removed: false, id: entryId };
  if (entries.length === 0) await deletePack("homebrew");
  else await savePack({ ...existing, entries });
  return { removed: true, id: entryId };
}

export interface PackSummary { id: string; name: string; version: string; source: string; entryCounts: Record<string, number>; }

export function listContentPacks(): PackSummary[] {
  return listPacks().map((p) => {
    const entryCounts: Record<string, number> = {};
    for (const e of p.entries) entryCounts[e.type] = (entryCounts[e.type] ?? 0) + 1;
    return { id: p.id, name: p.name, version: p.version, source: p.source, entryCounts };
  });
}

export async function removePack(packId: string): Promise<{ removed: true; packId: string }> {
  if (!(await deletePack(packId))) {
    throw new DomainError("not_found", `Pack "${packId}" no existe. Packs: ${listPacks().map((p) => p.id).join(", ")}`);
  }
  return { removed: true, packId };
}
