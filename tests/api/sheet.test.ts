import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { addItem, equipItem } from "../../src/domain/inventory.js";
import { importPack, removePack } from "../../src/domain/content.js";
import { characterSheet } from "../../src/api/sheet.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 12, dex: 16, con: 14, int: 8, wis: 14, cha: 10 };

beforeAll(async () => {
  await importPack({
    id: "test-cf", name: "rasgos test", version: "1.0.0", source: "test",
    entries: [
      { id: "classfeature:monk-1-ma", type: "classfeature", name: "Martial Arts", data: { class: "Monk", level: 1, summary: "Dominas artes marciales sin armas." } },
      { id: "item:armadura-resist-test", type: "item", name: "Armadura Resistencia Test", data: { itemType: "armor", armorClass: 14, armorCategory: "medium", resistances: ["Fuego"], homebrew: true } },
      { id: "species:enano-test", type: "species", name: "Enano Test", data: { size: "Medium", speed: 30, traits: ["Resistencia Enana: resistencia a Veneno."], resistances: ["Veneno"] } },
    ],
  });
});
afterAll(async () => { await removePack("test-cf"); });

describe("hoja: descripción de rasgos de clase", () => {
  it("enriquece un rasgo de clase (solo nombre) con la descripción del contenido", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "Monje", className: "Monk", level: 1, species: "Human", background: "Soldier", abilities: ABIL });
    const sheet = characterSheet(c) as { features: { name: string; description: string | null }[] };
    const ma = sheet.features.find((f) => f.name === "Martial Arts");
    expect(ma).toBeTruthy();
    expect(ma!.description).toContain("artes marciales");
  });

  it("una armadura equipada con resistencia añade esa resistencia a la hoja", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "Guer" + Math.random(), className: "Fighter", level: 1, species: "Human", background: "Soldier", abilities: ABIL });
    addItem(c, "Armadura Resistencia Test");
    let sheet = characterSheet(c) as { resistances: string[] };
    expect(sheet.resistances).not.toContain("Fuego"); // aún no equipada
    equipItem(c, "Armadura Resistencia Test");
    sheet = characterSheet(c) as { resistances: string[] };
    expect(sheet.resistances).toContain("Fuego"); // equipada → aporta la resistencia
  });

  it("la resistencia racial (Resistencia Enana → Veneno) aparece en la hoja", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "Enano" + Math.random(), className: "Fighter", level: 1, species: "Enano Test", background: "Soldier", abilities: ABIL });
    const sheet = characterSheet(c) as { resistances: string[] };
    expect(sheet.resistances).toContain("Veneno");
  });
});
