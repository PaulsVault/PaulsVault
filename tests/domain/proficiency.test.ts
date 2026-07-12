import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem, equipItem } from "../../src/domain/inventory.js";
import { check } from "../../src/domain/checks.js";
import { castSpell, learnSpell } from "../../src/domain/spells.js";
import { armorPenalty, effectiveProficiencies, isProficientWithItem } from "../../src/domain/proficiency.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 14, con: 14, int: 16, wis: 12, cha: 10 };
const make = (cls: string, lvl = 5) => createCharacter({ characters: [] } as Database,
  { name: "C" + Math.random(), className: cls, level: lvl, species: "Human", background: "Soldier", abilities: ABIL });

beforeAll(async () => {
  await importPack({
    id: "test-equip", name: "equipo test", version: "1.0.0", source: "test", entries: [
      { id: "item:greatsword-t", type: "item", name: "Espadon Test", data: { itemType: "weapon", weaponCategory: "martial", damage: "2d6 slashing", properties: ["heavy", "two-handed"] } },
      { id: "item:shortsword-t", type: "item", name: "Espada Corta Test", data: { itemType: "weapon", weaponCategory: "martial", damage: "1d6 piercing", properties: ["finesse", "light"] } },
      { id: "item:club-t", type: "item", name: "Garrote Test", data: { itemType: "weapon", weaponCategory: "simple", damage: "1d4 bludgeoning", properties: ["light"] } },
      { id: "item:mystery-t", type: "item", name: "Arma Misteriosa", data: { itemType: "weapon", damage: "1d8 slashing" } },
      { id: "item:plate-t", type: "item", name: "Placas Test", data: { itemType: "armor", armorClass: 18, armorCategory: "heavy" } },
      { id: "spell:mm-t", type: "spell", name: "Proyectil Test", data: { level: 1, summary: "Tres dardos de fuerza." } },
    ],
  });
});
afterAll(async () => { await removePack("test-equip"); });

describe("competencias de arma por clase", () => {
  it("el Guerrero es competente con armas marciales y armadura pesada", () => {
    const c = make("Fighter");
    expect(isProficientWithItem(c, addItem(c, "Espadon Test"))).toBe(true);
    expect(isProficientWithItem(c, addItem(c, "Placas Test"))).toBe(true);
  });

  it("el Mago NO es competente con marciales ni pesada, sí con simples", () => {
    const c = make("Wizard");
    expect(isProficientWithItem(c, addItem(c, "Espadon Test"))).toBe(false);
    expect(isProficientWithItem(c, addItem(c, "Placas Test"))).toBe(false);
    expect(isProficientWithItem(c, addItem(c, "Garrote Test"))).toBe(true);
  });

  it("el Monje: marcial ligera sí (espada corta), marcial pesada no (espadon)", () => {
    const c = make("Monk");
    expect(isProficientWithItem(c, addItem(c, "Espada Corta Test"))).toBe(true);
    expect(isProficientWithItem(c, addItem(c, "Espadon Test"))).toBe(false);
  });

  it("el Picaro: marcial con finesse/light sí, espadon no", () => {
    const c = make("Rogue");
    expect(isProficientWithItem(c, addItem(c, "Espada Corta Test"))).toBe(true);
    expect(isProficientWithItem(c, addItem(c, "Espadon Test"))).toBe(false);
  });

  it("arma sin categoria conocida no genera aviso (se asume competente)", () => {
    const c = make("Wizard");
    expect(isProficientWithItem(c, addItem(c, "Arma Misteriosa"))).toBe(true);
  });

  it("createCharacter guarda las competencias de la clase principal", () => {
    const f = make("Fighter");
    expect(f.proficiencies.weapons).toContain("martial");
    expect(f.proficiencies.armor).toContain("heavy");
    const eff = effectiveProficiencies(f);
    expect(eff.weapons.has("martial")).toBe(true);
  });
});

describe("penalizaciones por equipo sin competencia (2024)", () => {
  it("un arma sin competencia ataca sin el bono de competencia", () => {
    const c = make("Wizard");
    addItem(c, "Espadon Test");
    const r = check(c, { type: "attack", target: "Espadon" });
    expect(r.type).toBe("attack");
    if (r.type !== "damage") expect(r.modifierDetail).toContain("sin competencia");
  });

  it("un arma con competencia sí suma el bono", () => {
    const c = make("Fighter");
    addItem(c, "Espadon Test");
    const r = check(c, { type: "attack", target: "Espadon" });
    if (r.type !== "damage") expect(r.modifierDetail).toContain("comp(");
  });

  it("armadura sin competencia equipada activa la penalizacion y bloquea conjuros", () => {
    const c = make("Wizard");
    const plate = addItem(c, "Placas Test");
    equipItem(c, plate.id);
    expect(armorPenalty(c).active).toBe(true);
    learnSpell(c, "Proyectil Test");
    expect(() => castSpell(c, { spell: "Proyectil Test", level: 1 })).toThrow(/competencia/i);
  });

  it("armadura con competencia equipada no penaliza", () => {
    const c = make("Fighter");
    const plate = addItem(c, "Placas Test");
    equipItem(c, plate.id);
    expect(armorPenalty(c).active).toBe(false);
  });

  it("con armadura sin competencia, la salvacion de DES tira con desventaja", () => {
    const c = make("Wizard");
    const plate = addItem(c, "Placas Test");
    equipItem(c, plate.id);
    const r = check(c, { type: "save", target: "dex" });
    if (r.type !== "damage") expect(r.modifierDetail).toContain("desventaja (armadura sin competencia)");
  });
});
