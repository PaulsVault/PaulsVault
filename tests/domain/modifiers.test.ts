import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, saveDb } from "../../src/store.js";
import { createCharacter } from "../../src/domain/characters.js";
import { computeActiveModifiers } from "../../src/domain/modifiers.js";
import type { Abilities, ActiveEffect, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

function hero(): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  // sin armadura: CA = 10 + DES(+2) = 12; velocidad 30
  return createCharacter(db, { name: "Héroe", className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
}

function effect(name: string): ActiveEffect {
  return { id: name, name, roundsRemaining: null, minutesRemaining: null, concentration: false, appliesTo: "self" };
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

it("sin estados, los valores finales igualan la base", () => {
  const m = computeActiveModifiers(hero());
  expect(m.ac.final).toBe(12);
  expect(m.speed.final).toBe(30);
  expect(m.attack.mode).toBe("normal");
  expect(m.incapacitated).toBe(false);
});

it("Restrained: velocidad 0, ataque con desventaja, salvación de DES con desventaja", () => {
  const c = hero();
  c.conditions.push({ name: "Restrained" });
  const m = computeActiveModifiers(c);
  expect(m.speed.final).toBe(0);
  expect(m.attack.mode).toBe("disadvantage");
  expect(m.saves.dex.mode).toBe("disadvantage");
});

it("Paralyzed: velocidad 0, auto-fallo FUE/DES, incapacitado", () => {
  const c = hero();
  c.conditions.push({ name: "Paralyzed" });
  const m = computeActiveModifiers(c);
  expect(m.speed.final).toBe(0);
  expect(m.saves.str.autofail).toBe(true);
  expect(m.saves.dex.autofail).toBe(true);
  expect(m.incapacitated).toBe(true);
});

it("Exhaustion 2: -4 a las tiradas d20 y -10 ft de velocidad", () => {
  const c = hero();
  c.conditions.push({ name: "Exhaustion", level: 2 });
  const m = computeActiveModifiers(c);
  expect(m.speed.final).toBe(20);
  expect(m.attack.bonuses.some((b) => b.startsWith("-4"))).toBe(true);
  expect(m.saves.con.bonuses.some((b) => b.startsWith("-4"))).toBe(true);
});

it("Haste: +2 CA, velocidad x2, ventaja en salvaciones de DES", () => {
  const c = hero();
  c.effects.push(effect("Haste"));
  const m = computeActiveModifiers(c);
  expect(m.ac.final).toBe(14); // 12 + 2
  expect(m.speed.final).toBe(60); // 30 × 2
  expect(m.saves.dex.mode).toBe("advantage");
});

it("Shield: +5 CA", () => {
  const c = hero();
  c.effects.push(effect("Shield"));
  expect(computeActiveModifiers(c).ac.final).toBe(17); // 12 + 5
});

it("Bless: +1d4 a ataques y salvaciones (bono de tirada)", () => {
  const c = hero();
  c.effects.push(effect("Bless"));
  const m = computeActiveModifiers(c);
  expect(m.attack.bonuses.some((b) => b.includes("1d4"))).toBe(true);
  expect(m.saves.wis.bonuses.some((b) => b.includes("1d4"))).toBe(true);
});

it("ventaja + desventaja se anulan (regla 2024)", () => {
  const c = hero();
  c.conditions.push({ name: "Invisible" }); // ataque con ventaja
  c.conditions.push({ name: "Poisoned" });  // ataque con desventaja
  expect(computeActiveModifiers(c).attack.mode).toBe("normal");
});

it("mecánicas homebrew en el efecto sobreescriben el default", () => {
  const c = hero();
  c.effects.push({ ...effect("Maldición"), mechanics: [{ target: "ac", op: "add", value: -2 }] });
  expect(computeActiveModifiers(c).ac.final).toBe(10); // 12 - 2
});
