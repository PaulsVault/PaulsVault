// Dominio de compañeros/mascotas/familiares/invocaciones. Cada uno con PG, CA, ataques y condiciones propias.

import { DomainError } from "./errors.js";
import { newId } from "../rules.js";
import type { Abilities, Character, Companion } from "../types.js";

export interface CompanionInput {
  name?: string;
  kind?: Companion["kind"];
  species?: string;
  hpMax?: number;
  ac?: number;
  speed?: string;
  abilities?: Partial<Abilities>;
  attacks?: { name: string; bonus: number; damage: string }[];
  notes?: string;
  art?: string;
}

export function requireCompanion(c: Character, idOrName: string): Companion {
  const k =
    c.companions.find((x) => x.id === idOrName) ??
    c.companions.find((x) => x.name.toLowerCase().includes(idOrName.toLowerCase()));
  if (!k) {
    const names = c.companions.map((x) => x.name).join(", ") || "ninguno";
    throw new DomainError("not_found", `Compañero "${idOrName}" no encontrado. Existentes: ${names}.`);
  }
  return k;
}

export function companionsView(c: Character): Record<string, unknown> {
  return {
    companions: c.companions.map((k) => ({
      id: k.id, name: k.name, kind: k.kind, species: k.species,
      hp: k.hp, ac: k.ac, speed: k.speed,
      conditions: k.conditions.map((x) => x.name),
      attacks: k.attacks,
    })),
  };
}

export function createCompanion(c: Character, details: CompanionInput): Companion {
  if (!details.name || !details.hpMax) {
    throw new DomainError("validation", "Un compañero requiere al menos name y hpMax.");
  }
  const k: Companion = {
    id: newId("cmp"),
    name: details.name,
    kind: details.kind ?? "companion",
    species: details.species,
    abilities: details.abilities,
    ac: details.ac,
    hp: { max: details.hpMax, current: details.hpMax, temp: 0 },
    speed: details.speed,
    attacks: details.attacks,
    conditions: [],
    notes: details.notes,
    art: details.art,
  };
  c.companions.push(k);
  return k;
}

export function updateCompanion(c: Character, idOrName: string, details: CompanionInput): Companion {
  const k = requireCompanion(c, idOrName);
  if (details.name) k.name = details.name;
  if (details.kind) k.kind = details.kind;
  if (details.species) k.species = details.species;
  if (details.hpMax) { k.hp.max = details.hpMax; k.hp.current = Math.min(k.hp.current, details.hpMax); }
  if (details.ac !== undefined) k.ac = details.ac;
  if (details.speed) k.speed = details.speed;
  if (details.abilities) k.abilities = { ...k.abilities, ...details.abilities };
  if (details.attacks) k.attacks = details.attacks;
  if (details.notes !== undefined) k.notes = details.notes;
  if (details.art !== undefined) k.art = details.art;
  return k;
}

export function deleteCompanion(c: Character, idOrName: string): { deleted: true; name: string } {
  const k = requireCompanion(c, idOrName);
  c.companions = c.companions.filter((x) => x.id !== k.id);
  c.effects = c.effects.filter((e) => e.companionId !== k.id);
  return { deleted: true, name: k.name };
}

export function damageCompanion(c: Character, idOrName: string, amount: number): { hp: Companion["hp"]; downed: boolean } {
  const k = requireCompanion(c, idOrName);
  let dmg = amount;
  if (k.hp.temp > 0) { const a = Math.min(k.hp.temp, dmg); k.hp.temp -= a; dmg -= a; }
  k.hp.current = Math.max(0, k.hp.current - dmg);
  return { hp: k.hp, downed: k.hp.current === 0 };
}

export function healCompanion(c: Character, idOrName: string, amount: number): { hp: Companion["hp"] } {
  const k = requireCompanion(c, idOrName);
  k.hp.current = Math.min(k.hp.max, k.hp.current + amount);
  return { hp: k.hp };
}
