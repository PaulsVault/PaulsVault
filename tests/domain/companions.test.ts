import { beforeEach, describe, expect, it } from "vitest";
// Store en memoria: los tests de dominio prueban lógica sobre `db`, no persistencia.
const loadDb = () => ({ characters: [] as never[] });
const saveDb = (_db: unknown): void => { void _db; };
import { createCharacter } from "../../src/domain/characters.js";
import {
  createCompanion, damageCompanion, deleteCompanion, healCompanion, updateCompanion,
} from "../../src/domain/companions.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 10, dex: 14, con: 12, int: 10, wis: 14, cha: 10 };

function owner(): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  return createCharacter(db, { name: "Druida", className: "Druid", species: "Human", background: "Sage", abilities: ABIL });
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

it("createCompanion exige name y hpMax", () => {
  const c = owner();
  expect(() => createCompanion(c, { name: "Lobo" })).toThrowError(DomainError);
});

it("crea, actualiza, daña (temp primero) y cura un compañero", () => {
  const c = owner();
  const k = createCompanion(c, { name: "Atenea", kind: "familiar", species: "Owl", hpMax: 6, ac: 11 });
  expect(k.hp.max).toBe(6);
  updateCompanion(c, "Atenea", { hpMax: 10 });
  expect(c.companions[0].hp.max).toBe(10);
  c.companions[0].hp.current = 10;
  c.companions[0].hp.temp = 3;
  const d = damageCompanion(c, "Atenea", 5); // 3 temp + 2 hp
  expect(d.hp.current).toBe(8);
  healCompanion(c, "Atenea", 100);
  expect(c.companions[0].hp.current).toBe(10);
});

it("borrar compañero elimina también sus efectos", () => {
  const c = owner();
  const k = createCompanion(c, { name: "Oso", hpMax: 20 });
  c.effects.push({ id: "e1", name: "Buff", roundsRemaining: null, minutesRemaining: null, concentration: false, appliesTo: "companion", companionId: k.id });
  deleteCompanion(c, "Oso");
  expect(c.companions).toHaveLength(0);
  expect(c.effects).toHaveLength(0);
});
