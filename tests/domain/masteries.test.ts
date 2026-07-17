import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { eligibleMasteryWeapons, setWeaponMasteries, weaponMasteryMax } from "../../src/domain/masteries.js";
import { importPack, removePack } from "../../src/domain/content.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 15, dex: 12, con: 14, int: 10, wis: 10, cha: 8 };
const make = (level: number, className = "Fighter Test") =>
  createCharacter({ characters: [] } as Database, { name: "M" + Math.random(), className, level, species: "Human", background: "Soldier", abilities: ABIL });

beforeAll(async () => {
  await importPack({
    id: "test-mastery", name: "maestrias test", version: "1.0.0", source: "test", entries: [
      { id: "class:fighter-test", type: "class", name: "Fighter Test", data: { hitDie: 10, saves: ["str", "con"], weapons: ["simple", "martial"], weaponMastery: { "1": 3, "4": 4 } } },
      { id: "class:wizard-test", type: "class", name: "Wizard Test", data: { hitDie: 6, saves: ["int", "wis"], weapons: ["simple"] } },
      { id: "item:greataxe-test", type: "item", name: "Greataxe Test", data: { itemType: "weapon", weaponCategory: "martial", mastery: ["Cleave"], properties: ["heavy", "two-handed"] } },
      { id: "item:dagger-test", type: "item", name: "Dagger Test", data: { itemType: "weapon", weaponCategory: "simple", mastery: ["Nick"], properties: ["finesse", "light"] } },
      { id: "item:staff-test", type: "item", name: "Staff Test", data: { itemType: "weapon", weaponCategory: "simple" } }, // sin maestría
      { id: "rule:cleave-test", type: "rule", name: "Cleave", data: { summary: "Atacas a un segundo enemigo adyacente." } },
    ],
  });
});
afterAll(async () => { await removePack("test-mastery"); });

describe("maestrías de arma (2024)", () => {
  it("el nº de maestrías sigue la tabla de la clase por nivel", () => {
    expect(weaponMasteryMax(make(1))).toBe(3);
    expect(weaponMasteryMax(make(3))).toBe(3);
    expect(weaponMasteryMax(make(4))).toBe(4); // sube a nivel 4
  });

  it("una clase no marcial no tiene maestrías", () => {
    expect(weaponMasteryMax(make(5, "Wizard Test"))).toBe(0);
  });

  it("solo lista armas con maestría con las que se es competente", () => {
    const el = eligibleMasteryWeapons(make(1)).map((w) => w.name);
    expect(el).toContain("Greataxe Test");
    expect(el).toContain("Dagger Test");
    expect(el).not.toContain("Staff Test"); // sin propiedad de maestría
  });

  it("fija las maestrías elegidas respetando el máximo y la competencia", () => {
    const c = make(1);
    setWeaponMasteries(c, ["Greataxe Test", "Dagger Test"]);
    expect(c.weaponMasteries).toEqual(["Greataxe Test", "Dagger Test"]);
  });

  it("rechaza pasarse del máximo del nivel", () => {
    const c = make(1); // máx 3
    expect(() => setWeaponMasteries(c, ["Greataxe Test", "Dagger Test", "Greataxe Test", "Staff Test"])).toThrow(DomainError);
  });

  it("rechaza un arma sin maestría o sin competencia", () => {
    const c = make(1);
    expect(() => setWeaponMasteries(c, ["Staff Test"])).toThrow(DomainError);
  });
});
