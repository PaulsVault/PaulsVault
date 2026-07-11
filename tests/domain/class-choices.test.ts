import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classChoicesAt, createCharacter, levelUp } from "../../src/domain/characters.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 15, dex: 12, con: 13, int: 10, wis: 10, cha: 8 };

beforeAll(async () => {
  await importPack({
    id: "test-choices", name: "opciones test", version: "1.0.0", source: "test",
    entries: [
      { id: "feat:test-defense", type: "feat", name: "Test Defense", data: { category: "FS", summary: "+1 a la CA." } },
      { id: "optionalfeature:test-invocation", type: "optionalfeature", name: "Test Invocation", data: { featureType: ["EI"], summary: "Una invocación de prueba." } },
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

  it("Wizard no ofrece elecciones de este tipo", () => {
    expect(classChoicesAt("Wizard", 2)).toHaveLength(0);
  });

  it("levelUp aplica las opciones elegidas como rasgos", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "G", className: "Fighter", level: 1, species: "Human", background: "Soldier", abilities: ABIL });
    levelUp(c, { className: "Fighter", options: ["Test Defense"] });
    expect(c.features.some((f) => f.name === "Test Defense")).toBe(true);
  });
});
