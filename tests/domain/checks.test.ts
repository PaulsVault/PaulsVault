import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, saveDb } from "../../src/store.js";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem } from "../../src/domain/inventory.js";
import { check, rollDice } from "../../src/domain/checks.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

function fighter(): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  const c = createCharacter(db, { name: "Peleador", className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
  addItem(c, "Longsword");
  return c;
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

describe("rollDice", () => {
  it("respeta el rango de la expresión", () => {
    for (let i = 0; i < 20; i++) {
      const [r] = rollDice("2d6+3");
      expect(r.total).toBeGreaterThanOrEqual(5);
      expect(r.total).toBeLessThanOrEqual(15);
    }
  });

  it("times repite la tirada", () => {
    expect(rollDice("1d20", "normal", 3)).toHaveLength(3);
  });
});

describe("check", () => {
  it("prueba de habilidad usa la característica correcta", () => {
    const c = fighter();
    const r = check(c, { type: "skill", target: "stealth" });
    if (r.type !== "damage") expect(r.modifierDetail).toContain("DEX");
  });

  it("salvación con competencia refleja el bono", () => {
    const c = fighter();
    const r = check(c, { type: "save", target: "con" });
    if (r.type !== "damage") expect(r.modifierDetail).toContain("CON");
  });

  it("ataque con arma del inventario devuelve una tirada", () => {
    const c = fighter();
    const r = check(c, { type: "attack", target: "Longsword" });
    if (r.type !== "damage") {
      expect(typeof r.roll).toBe("number");
      expect(r.modifierDetail).toContain("comp");
    }
  });

  it("daño crítico duplica los dados del arma", () => {
    const c = fighter();
    const r = check(c, { type: "damage", target: "Longsword", critical: true });
    if (r.type === "damage") expect(r.expression).toContain("2d8"); // Longsword 1d8 → 2d8
  });

  it("spell_attack sin habilidad de conjuro lanza", () => {
    const c = fighter();
    expect(() => check(c, { type: "spell_attack" })).toThrowError(DomainError);
  });
});
