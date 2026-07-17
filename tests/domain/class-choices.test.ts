import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classChoicesAt, createCharacter, grantFeat, levelUp } from "../../src/domain/characters.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 15, dex: 12, con: 13, int: 10, wis: 10, cha: 8 };

beforeAll(async () => {
  await importPack({
    id: "test-choices", name: "opciones test", version: "1.0.0", source: "test",
    entries: [
      { id: "feat:test-defense", type: "feat", name: "Test Defense", data: { category: "FS", summary: "+1 a la CA." } },
      { id: "optionalfeature:test-invocation", type: "optionalfeature", name: "Test Invocation", data: { featureType: ["EI"], summary: "Una invocación de prueba." } },
      { id: "optionalfeature:test-inv-lvl5", type: "optionalfeature", name: "Test Invocation L5", data: { featureType: ["EI"], prerequisite: "Nivel 5", summary: "Invocación que exige nivel 5." } },
      { id: "optionalfeature:test-maneuver", type: "optionalfeature", name: "Test Maneuver", data: { featureType: ["MV:B"], summary: "Una maniobra de prueba." } },
      { id: "feat:test-half", type: "feat", name: "Test Half Feat", data: { category: "G", summary: "+1 a Fuerza o Destreza.", abilityChoice: { from: ["str", "dex"], count: 1, amount: 1 } } },
    ],
  });
});
afterAll(async () => { await removePack("test-choices"); });

describe("elecciones de clase por nivel", () => {
  it("Fighter nivel 1 ofrece estilo de combate con las dotes de categoría FS", () => {
    const fs = classChoicesAt("Fighter", 1).find((c) => c.kind === "fighting-style");
    expect(fs).toBeTruthy();
    expect(fs!.options.some((o) => o.name === "Test Defense")).toBe(true);
  });

  it("Warlock nivel 2 ofrece invocaciones (optionalfeature featureType EI)", () => {
    const inv = classChoicesAt("Warlock", 2).find((c) => c.kind === "invocation");
    expect(inv).toBeTruthy();
    expect(inv!.count).toBe(2);
    expect(inv!.options.some((o) => o.name === "Test Invocation")).toBe(true);
  });

  it("#12 filtra invocaciones por prerequisito de nivel (solo las desbloqueadas)", () => {
    const at2 = classChoicesAt("Warlock", 2).find((c) => c.kind === "invocation")!;
    // A nivel 2 aparece la sin prereq pero NO la que exige nivel 5.
    expect(at2.options.some((o) => o.name === "Test Invocation")).toBe(true);
    expect(at2.options.some((o) => o.name === "Test Invocation L5")).toBe(false);
    // A nivel 5 sí aparece la que exige nivel 5.
    const at5 = classChoicesAt("Warlock", 5).find((c) => c.kind === "invocation")!;
    expect(at5.options.some((o) => o.name === "Test Invocation L5")).toBe(true);
  });

  it("#2 el Maestro de Batalla ofrece maniobras a nivel 3 (elección de subclase)", () => {
    expect(classChoicesAt("Fighter", 3).some((c) => c.kind === "maneuver")).toBe(false); // sin subclase
    const man = classChoicesAt("Fighter", 3, "Battle Master").find((c) => c.kind === "maneuver");
    expect(man).toBeTruthy();
    expect(man!.count).toBe(3);
    expect(man!.options.some((o) => o.name === "Test Maneuver")).toBe(true);
  });

  it("#14 el Hechicero Dracónico elige tipo de daño (afinidad elemental) a nivel 6", () => {
    expect(classChoicesAt("Sorcerer", 6).some((c) => c.kind === "resistance")).toBe(false); // sin subclase
    const res = classChoicesAt("Sorcerer", 6, "Draconic Sorcery").find((c) => c.kind === "resistance");
    expect(res).toBeTruthy();
    expect(res!.options.map((o) => o.name)).toContain("Fuego");
    // Al aplicarla, el personaje gana la resistencia y un rasgo con nombre claro.
    const c = createCharacter({ characters: [] } as Database,
      { name: "S" + Math.random(), className: "Sorcerer", level: 5, species: "Human", background: "Sage", abilities: ABIL });
    levelUp(c, { className: "Sorcerer", subclass: "Draconic Sorcery", resistances: ["Fuego"] });
    expect(c.resistances).toContain("Fuego");
    expect(c.features.some((f) => f.name === "Afinidad elemental (Fuego)")).toBe(true);
  });

  it("Wizard no ofrece elecciones de este tipo", () => {
    expect(classChoicesAt("Wizard", 2)).toHaveLength(0);
  });

  it("levelUp aplica las opciones elegidas como rasgos", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "G", className: "Fighter", level: 1, species: "Human", background: "Soldier", abilities: ABIL });
    levelUp(c, { className: "Fighter", options: ["Test Defense"] });
    expect(c.features.some((f) => f.name === "Test Defense")).toBe(true);
  });

  it("#1 createCharacter aplica las elecciones de nivel 1 (estilo de combate)", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "G2", className: "Fighter", level: 1, species: "Human", background: "Soldier", abilities: ABIL, options: ["Test Defense"] });
    expect(c.features.some((f) => f.name === "Test Defense")).toBe(true);
  });

  it("#3 media dote aplica la mejora de característica elegida al subir de nivel", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "H1", className: "Fighter", level: 3, species: "Human", background: "Soldier", abilities: ABIL });
    const before = c.abilities.dex;
    levelUp(c, { className: "Fighter", feat: "Test Half Feat", featAbilities: { dex: 1 } });
    expect(c.abilities.dex).toBe(before + 1);
    expect(c.abilities.str).toBe(ABIL.str); // no toca la que no eligió
  });

  it("#3 grantFeat (regalo) aplica también la media dote elegida", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "H2", className: "Fighter", level: 1, species: "Human", background: "Soldier", abilities: ABIL });
    const before = c.abilities.str;
    grantFeat(c, "Test Half Feat", "Regalo de campaña", { str: 1 });
    expect(c.abilities.str).toBe(before + 1);
  });
});
