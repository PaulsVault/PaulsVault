import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter, levelDown } from "../../src/domain/characters.js";
import { grantedSpellChoiceNotes } from "../../src/domain/spells.js";
import { importPack, removePack, searchContent } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const db = (): Database => ({ characters: [] });
const make = (opts: { species?: string; level?: number; subclass?: string } = {}) =>
  createCharacter(db(), {
    name: "G" + Math.random(), className: "Cleric", level: opts.level ?? 1,
    species: opts.species ?? "Humano Test", background: "Acolyte", abilities: ABIL, subclass: opts.subclass,
  });

beforeAll(async () => {
  await importPack({
    id: "test-grants", name: "otorgados test", version: "1.0.0", source: "test", entries: [
      { id: "species:elfo-test", type: "species", name: "Elfo Test", data: { size: "Medium", speed: 30, traits: [], grantedSpells: [{ level: 1, name: "Luz Test" }], grantedSpellAbility: "cha" } },
      { id: "species:variante-test", type: "species", name: "Variante Test", data: { size: "Medium", speed: 30, traits: [], grantedSpellChoices: [{ level: 1 }] } },
      { id: "species:humano-test", type: "species", name: "Humano Test", data: { size: "Medium", speed: 30, traits: [] } },
      { id: "subclass:dominio-test", type: "subclass", name: "Dominio Test", data: { class: "Cleric", features: [], grantedSpells: [{ level: 3, name: "Bendicion Test" }, { level: 5, name: "Revivir Test" }] } },
      { id: "spell:luz-test", type: "spell", name: "Luz Test", data: { level: 0, classes: ["Wizard"], summary: "Truco de luz." } },
      { id: "spell:bendicion-test", type: "spell", name: "Bendicion Test", data: { level: 1, classes: ["Cleric"], summary: "Bendice." } },
      { id: "spell:revivir-test", type: "spell", name: "Revivir Test", data: { level: 3, classes: ["Cleric"], summary: "Revive." } },
      { id: "spell:bola-test", type: "spell", name: "Bola Test", data: { level: 3, classes: ["Wizard"], summary: "8d6 de fuego." } },
    ],
  });
});
afterAll(async () => { await removePack("test-grants"); });

describe("conjuros otorgados por especie/subclase (Parte C)", () => {
  it("la especie otorga su conjuro fijo al crear (siempre preparado)", () => {
    const c = make({ species: "Elfo Test" });
    const luz = c.spellcasting.known.find((s) => s.name === "Luz Test");
    expect(luz).toBeDefined();
    expect(luz!.alwaysPrepared).toBe(true);
    expect(luz!.source).toMatch(/Otorgado: Elfo Test/);
  });

  it("un no lanzador con truco racial obtiene habilidad de lanzamiento", () => {
    const c = createCharacter(db(), { name: "F" + Math.random(), className: "Fighter", level: 1, species: "Elfo Test", background: "Soldier", abilities: ABIL });
    expect(c.spellcasting.known.some((s) => s.name === "Luz Test")).toBe(true);
    expect(c.spellcasting.ability).toBe("cha");
  });

  it("la subclase otorga sus conjuros solo hasta el nivel de clase alcanzado", () => {
    const l5 = make({ level: 5, subclass: "Dominio Test" });
    expect(l5.spellcasting.known.some((s) => s.name === "Bendicion Test")).toBe(true); // nivel 3
    expect(l5.spellcasting.known.some((s) => s.name === "Revivir Test")).toBe(true);   // nivel 5

    const l3 = make({ level: 3, subclass: "Dominio Test" });
    expect(l3.spellcasting.known.some((s) => s.name === "Bendicion Test")).toBe(true);
    expect(l3.spellcasting.known.some((s) => s.name === "Revivir Test")).toBe(false);  // aún no (nivel 5)
  });

  it("bajar de nivel quita los conjuros otorgados por encima del nuevo nivel", () => {
    const c = make({ level: 5, subclass: "Dominio Test" });
    expect(c.spellcasting.known.some((s) => s.name === "Revivir Test")).toBe(true);
    levelDown(c, "Cleric"); // 5 → 4
    expect(c.spellcasting.known.some((s) => s.name === "Revivir Test")).toBe(false);
    expect(c.spellcasting.known.some((s) => s.name === "Bendicion Test")).toBe(true);
  });

  it("las variantes (linaje/tierra) no se auto-otorgan: generan aviso de elección", () => {
    const c = make({ species: "Variante Test" });
    expect(c.spellcasting.known.length).toBe(0);
    expect(grantedSpellChoiceNotes(c).length).toBeGreaterThan(0);
  });
});

describe("filtro de conjuros por clase (Parte B)", () => {
  it("searchContent filtra los conjuros por la clase indicada", () => {
    const wiz = searchContent("Test", { type: "spell", spellClass: "Wizard" }).results.map((r) => r.name);
    expect(wiz).toContain("Bola Test");
    expect(wiz).toContain("Luz Test");
    expect(wiz).not.toContain("Bendicion Test"); // es de Cleric

    const cle = searchContent("Test", { type: "spell", spellClass: "Cleric" }).results.map((r) => r.name);
    expect(cle).toContain("Bendicion Test");
    expect(cle).not.toContain("Bola Test");
  });
});
