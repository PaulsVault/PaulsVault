import { beforeEach, describe, expect, it } from "vitest";
// Store en memoria: los tests de dominio prueban lógica sobre `db`, no persistencia.
const loadDb = () => ({ characters: [] as never[] });
const saveDb = (_db: unknown): void => { void _db; };
import { createCharacter } from "../../src/domain/characters.js";
import { customizeStyle } from "../../src/domain/style.js";
import type { Abilities } from "../../src/types.js";

const ABIL: Abilities = { str: 10, dex: 10, con: 10, int: 14, wis: 10, cha: 10 };

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

it("aplica solo los campos incluidos y fusiona tokens", () => {
  const db = loadDb();
  const c = createCharacter(db, { name: "Esteta", className: "Wizard", species: "Human", background: "Sage", abilities: ABIL });
  customizeStyle(c, { theme: "arcane", accentColor: "#8b0000", tokens: { border: "celtic" } });
  customizeStyle(c, { tokens: { icon: "runes" } });
  expect(c.style.theme).toBe("arcane");
  expect(c.style.accentColor).toBe("#8b0000");
  expect(c.style.tokens).toEqual({ border: "celtic", icon: "runes" });
  expect(c.style.layout).toBe("classic"); // no tocado
});
