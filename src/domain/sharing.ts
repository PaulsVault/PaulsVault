// Dominio de entrega a terceros: paquete portable `.dndchar` autocontenido.
// Un paquete lleva uno o varios personajes + los content packs homebrew que referencian,
// para que otra persona los reciba y use idénticos. No incluye los packs oficiales
// (srd-core, srd-52-reference), que se asumen disponibles en cualquier instalación.

import { listPacks } from "../store.js";
import { DomainError } from "./errors.js";
import { importCharacter, requireCharacter } from "./characters.js";
import { importPack } from "./content.js";
import type { Character, ContentPack, Database } from "../types.js";

export const OFFICIAL_PACKS = new Set(["srd-core", "srd-52-reference"]);

export interface DndCharPackage {
  format: "dndchar";
  version: number;
  exportedAt: string;
  characters: Character[];
  contentPacks: ContentPack[];
}

/** Nombres de contenido (clase, especie, hechizos, objetos...) que un personaje referencia. */
function referencedNames(c: Character): Set<string> {
  const names = new Set<string>();
  const addN = (s?: string) => { if (s) names.add(s.toLowerCase()); };
  for (const cl of c.classes) { addN(cl.name); addN(cl.subclass); }
  addN(c.species);
  addN(c.background);
  for (const s of c.spellcasting.known) addN(s.name);
  for (const i of c.inventory) addN(i.name);
  for (const f of c.features) addN(f.name);
  for (const cond of c.conditions) addN(cond.name);
  return names;
}

function buildPackage(chars: Character[]): DndCharPackage {
  const names = new Set<string>();
  for (const c of chars) for (const n of referencedNames(c)) names.add(n);
  const contentPacks = listPacks().filter(
    (p) => !OFFICIAL_PACKS.has(p.id) && p.entries.some((e) => names.has(e.name.toLowerCase())),
  );
  return {
    format: "dndchar",
    version: 1,
    exportedAt: new Date().toISOString(),
    characters: structuredClone(chars),
    contentPacks: structuredClone(contentPacks),
  };
}

/** Paquete de un solo personaje (RF-SHARE-1). */
export function packageCharacter(db: Database, idOrName: string): DndCharPackage {
  return buildPackage([requireCharacter(db, idOrName)]);
}

/** Paquete en lote de varios personajes en un solo archivo (RF-SHARE-4). */
export function packageBatch(db: Database, idsOrNames: string[]): DndCharPackage {
  if (idsOrNames.length === 0) throw new DomainError("validation", "Indica al menos un personaje para el lote.");
  return buildPackage(idsOrNames.map((x) => requireCharacter(db, x)));
}

export interface ImportPackageResult {
  characters: { id: string; name: string }[];
  packsInstalled: string[];
  packsSkipped: string[]; // homebrew propio no pisado (sin overwrite)
}

/** Importa un paquete recibido: instala sus packs y crea los personajes con id nuevo (RF-SHARE-2). */
export async function importPackage(db: Database, pkg: unknown, opts: { overwritePacks?: boolean } = {}): Promise<ImportPackageResult> {
  const p = pkg as DndCharPackage;
  if (!p || p.format !== "dndchar" || !Array.isArray(p.characters)) {
    throw new DomainError("validation", "Paquete .dndchar inválido: falta 'format' o 'characters'.");
  }
  const packsInstalled: string[] = [];
  const packsSkipped: string[] = [];
  const existing = new Set(listPacks().map((x) => x.id));
  for (const pack of p.contentPacks ?? []) {
    if (existing.has(pack.id) && !opts.overwritePacks) { packsSkipped.push(pack.id); continue; }
    await importPack(pack); // valida y guarda (mismo id = actualización)
    packsInstalled.push(pack.id);
  }
  const characters = p.characters.map((raw) => {
    const c = importCharacter(db, raw); // id nuevo + renombra colisión
    return { id: c.id, name: c.name };
  });
  return { characters, packsInstalled, packsSkipped };
}
