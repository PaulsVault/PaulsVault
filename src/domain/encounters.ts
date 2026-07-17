// Dominio de encuentros del DM: crear un encuentro y añadir combatientes (monstruos del bestiario,
// personajes jugadores enlazados, o NPCs manuales). El resto del estado (PG, turno, condiciones,
// orden) lo edita la UI y se persiste con el encuentro completo. Funciones sin I/O sobre el objeto.

import { findEntry } from "./content.js";
import { computeActiveModifiers } from "./modifiers.js";
import { DomainError } from "./errors.js";
import { abilityMod, newId } from "../rules.js";
import type { Character, Combatant, Encounter } from "../types.js";

const d20 = () => Math.floor(Math.random() * 20) + 1;
function touchEnc(enc: Encounter): void { enc.updatedAt = new Date().toISOString(); }

export function newEncounter(name?: string): Encounter {
  const now = new Date().toISOString();
  return { id: newId("enc"), name: (name ?? "").trim() || "Encuentro", round: 1, turnIndex: 0, combatants: [], createdAt: now, updatedAt: now };
}

export function requireEncounter(list: Encounter[], id: string): Encounter {
  const e = list.find((x) => x.id === id);
  if (!e) throw new DomainError("not_found", `Encuentro "${id}" no encontrado.`);
  return e;
}

/** Añade N copias de un monstruo del bestiario, con iniciativa tirada y sus PG/CA reales. */
export function addMonsterToEncounter(enc: Encounter, monsterName: string, count = 1): Combatant[] {
  const m = findEntry(monsterName, "monster");
  if (!m) throw new DomainError("not_found", `Monstruo "${monsterName}" no está en el bestiario. Sincroniza el contenido (npm run sync:2024).`);
  const d = m.data as Record<string, unknown>;
  const dexMod = abilityMod(Number((d["abilities"] as { dex?: number } | undefined)?.dex ?? 10));
  const hpAvg = Math.max(1, Number((d["hp"] as { average?: number } | undefined)?.average ?? 1));
  const ac = Number(d["ac"] ?? 10);
  const added: Combatant[] = [];
  const existing = enc.combatants.filter((c) => c.kind === "monster" && c.ref === m.name).length;
  const n = Math.max(1, Math.min(20, Math.floor(count)));
  for (let i = 0; i < n; i++) {
    const idx = existing + i + 1;
    const c: Combatant = {
      id: newId("cbt"),
      name: n > 1 || existing > 0 ? `${m.name} ${idx}` : m.name,
      kind: "monster", ref: m.name,
      initiative: d20() + dexMod, initiativeBonus: dexMod,
      ac, hp: { current: hpAvg, max: hpAvg, temp: 0 }, conditions: [], spent: [],
    };
    enc.combatants.push(c); added.push(c);
  }
  touchEnc(enc);
  return added;
}

/** Enlaza un personaje jugador: toma su CA, PG e iniciativa (bono) de la hoja. */
export function addPlayerToEncounter(enc: Encounter, character: Character): Combatant {
  const mods = computeActiveModifiers(character);
  const initBonus = abilityMod(character.abilities.dex) + (character.initiativeBonus ?? 0) + mods.initiativeFlat;
  const c: Combatant = {
    id: newId("cbt"), name: character.name, kind: "player", ref: character.id,
    initiative: null, initiativeBonus: initBonus, ac: mods.ac.final,
    hp: { current: character.hp.current, max: character.hp.max, temp: character.hp.temp }, conditions: [], spent: [],
  };
  enc.combatants.push(c);
  touchEnc(enc);
  return c;
}

/** Combatiente manual (NPC): nombre, CA, PG e iniciativa a mano. */
export function addNpcToEncounter(enc: Encounter, name: string, ac: number, hp: number, initiative: number | null): Combatant {
  const c: Combatant = {
    id: newId("cbt"), name: (name ?? "").trim() || "NPC", kind: "npc",
    initiative, ac: Math.max(0, ac), hp: { current: Math.max(0, hp), max: Math.max(1, hp), temp: 0 }, conditions: [], spent: [],
  };
  enc.combatants.push(c);
  touchEnc(enc);
  return c;
}

/** Valida y normaliza un encuentro recibido de la UI antes de guardarlo (PG/turno saneados). */
export function sanitizeEncounter(enc: Encounter): Encounter {
  enc.round = Math.max(1, Math.floor(enc.round || 1));
  enc.combatants = (enc.combatants ?? []).map((c) => ({
    ...c,
    hp: { current: Math.floor(c.hp?.current ?? 0), max: Math.max(1, Math.floor(c.hp?.max ?? 1)), temp: Math.max(0, Math.floor(c.hp?.temp ?? 0)) },
    conditions: c.conditions ?? [], spent: c.spent ?? [],
  }));
  enc.turnIndex = Math.max(0, Math.min(enc.turnIndex || 0, Math.max(0, enc.combatants.length - 1)));
  touchEnc(enc);
  return enc;
}
