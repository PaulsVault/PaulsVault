import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importPack, removePack } from "../../src/domain/content.js";
import { createCharacter } from "../../src/domain/characters.js";
import type { Abilities } from "../../src/types.js";

// El nivel de lanzador y la capacidad de conjuro se leen del CONTENIDO (casterType/spellcastingAbility),
// así funcionan las subclases lanzadoras (Embaucador Arcano, Caballero Arcano) y los semi-lanzadores 2024.
const ABIL: Abilities = { str: 10, dex: 14, con: 12, int: 16, wis: 12, cha: 10 };
const db = () => ({ characters: [] as never[] });
const make = (over: Record<string, unknown>) =>
  createCharacter(db(), { name: "X", species: "Human", background: "Sage", abilities: ABIL, ...over } as never);

beforeAll(async () => {
  await importPack({
    id: "test-caster", name: "test", version: "1.0.0", source: "test",
    entries: [
      // Semi-lanzador que redondea ARRIBA (Artífice/Paladín/Explorador 2024): slot desde nivel 1.
      { id: "class:tinker", type: "class", name: "Tinker", data: { hitDie: 8, saves: ["con", "int"], casterType: "artificer", spellcastingAbility: "int", keyFeatures: {} } },
      // Subclase lanzadora ⅓ sobre una clase no lanzadora (Embaucador Arcano): usa la lista de Mago.
      { id: "subclass:trick-blade", type: "subclass", name: "Trick Blade", data: { class: "Rogue", features: [], casterType: "1/3", spellcastingAbility: "int", spellListClass: "Wizard" } },
    ],
  });
});
afterAll(async () => { await removePack("test-caster"); });

describe("lanzadores derivados del contenido", () => {
  it("semi-lanzador 'artificer' tiene capacidad y slot desde nivel 1 (redondea arriba)", () => {
    const c = make({ className: "Tinker", level: 1 });
    expect(c.spellcasting.ability).toBe("int");
    expect(c.spellcasting.slots["1"]?.max).toBe(2);
  });

  it("semi-lanzador nivel 5 → nivel de lanzador 3 → slots {1:4, 2:2}", () => {
    const c = make({ className: "Tinker", level: 5 });
    expect(c.spellcasting.slots["1"]?.max).toBe(4);
    expect(c.spellcasting.slots["2"]?.max).toBe(2);
    expect(c.spellcasting.slots["3"]).toBeUndefined();
  });

  it("una subclase lanzadora ⅓ presta su capacidad y da slots (como el Embaucador Arcano en el Pícaro)", () => {
    const c = make({ className: "Rogue", subclass: "Trick Blade", level: 3 });
    expect(c.spellcasting.ability).toBe("int"); // el Pícaro no lanza; la subclase fija la INT
    expect(c.spellcasting.slots["1"]?.max).toBe(2); // ⅓ de 3 = 1 → slots de lanzador nivel 1
  });

  it("un Pícaro sin subclase lanzadora sigue sin conjuros", () => {
    const c = make({ className: "Rogue", level: 3 });
    expect(c.spellcasting.ability).toBeUndefined();
    expect(Object.keys(c.spellcasting.slots).length).toBe(0);
  });
});
