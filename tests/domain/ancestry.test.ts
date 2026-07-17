import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { adjustFeatureUse } from "../../src/domain/combat.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };

beforeAll(async () => {
  await importPack({
    id: "test-ancestry", name: "ancestria test", version: "1.0.0", source: "test", entries: [
      { id: "species:goliath-test", type: "species", name: "Goliath Test", data: {
        size: "Medium", speed: 35, traits: [],
        ancestryChoices: [{ trait: "Giant Ancestry", usesPb: true, options: [
          { name: "Fire's Burn", description: "1d10 de fuego al golpear." },
          { name: "Stone's Endurance", description: "Reacción para reducir daño." },
        ] }],
      } },
      // Elfo de prueba: el linaje Wood sube la velocidad a 35 (override de la base 30).
      { id: "species:elf-test", type: "species", name: "Elf Test", data: {
        size: "Medium", speed: 30, traits: [],
        ancestryChoices: [{ trait: "Elven Lineage", options: [
          { name: "High Elf", description: "Prestidigitación." },
          { name: "Wood Elf", description: "Tu velocidad sube a 35.", speed: 35 },
        ] }],
      } },
      // Especie con elección de habilidad y dote de origen (estilo Human Skillful/Versatile).
      { id: "species:human-test", type: "species", name: "Human Test", data: {
        size: "Medium", speed: 30, traits: [],
        skillChoice: { count: 1, from: ["*"] }, featChoices: [{ category: "O", count: 1 }],
      } },
      { id: "feat:origin-tough", type: "feat", name: "Origin Tough", data: { category: "O", summary: "+2 PG por nivel." } },
    ],
  });
});
afterAll(async () => { await removePack("test-ancestry"); });

describe("ascendencia/linaje de especie", () => {
  it("aplica la ascendencia elegida como rasgo con su descripción", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "G" + Math.random(), className: "Barbarian", species: "Goliath Test", background: "Soldier",
      abilities: ABIL, ancestryChoices: { "Giant Ancestry": "Fire's Burn" },
    });
    const f = c.features.find((x) => x.name === "Giant Ancestry: Fire's Burn");
    expect(f).toBeDefined();
    expect(f!.source).toBe("Especie (ascendencia)");
    expect(f!.description).toMatch(/fuego/i);
    // no añade la opción no elegida
    expect(c.features.some((x) => x.name.includes("Stone's Endurance"))).toBe(false);
  });

  it("#11 el linaje Wood Elf sube la velocidad a 35", () => {
    const wood = createCharacter({ characters: [] } as Database, {
      name: "W" + Math.random(), className: "Wizard", species: "Elf Test", background: "Sage",
      abilities: ABIL, ancestryChoices: { "Elven Lineage": "Wood Elf" },
    });
    expect(wood.speed).toBe(35);
    const high = createCharacter({ characters: [] } as Database, {
      name: "H" + Math.random(), className: "Wizard", species: "Elf Test", background: "Sage",
      abilities: ABIL, ancestryChoices: { "Elven Lineage": "High Elf" },
    });
    expect(high.speed).toBe(30); // el linaje sin bonus no cambia la velocidad
  });

  it("#9 la ancestría del Goliath es usable con cargas = bono de competencia (descanso largo)", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "Gol" + Math.random(), className: "Barbarian", level: 5, species: "Goliath Test", background: "Soldier",
      abilities: ABIL, ancestryChoices: { "Giant Ancestry": "Fire's Burn" },
    });
    const f = c.features.find((x) => x.name === "Giant Ancestry: Fire's Burn")!;
    expect(f.uses).toBeDefined();
    expect(f.uses!.perProficiencyBonus).toBe(true);
    expect(f.uses!.max).toBe(3); // nivel 5 → PB 3
    expect(f.uses!.used).toBe(0);
    // Gastar y restaurar usos, respetando el máximo (PB).
    adjustFeatureUse(c, "Giant Ancestry: Fire's Burn", 1);
    expect(f.uses!.used).toBe(1);
    adjustFeatureUse(c, "Giant Ancestry: Fire's Burn", 5); // no pasa del máximo
    expect(f.uses!.used).toBe(3);
    adjustFeatureUse(c, "Giant Ancestry: Fire's Burn", -10); // no baja de 0
    expect(f.uses!.used).toBe(0);
  });

  it("#11 aplica habilidad de especie y dote de origen elegidas (estilo Human)", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "Hu" + Math.random(), className: "Fighter", species: "Human Test", background: "Soldier",
      abilities: ABIL, speciesSkills: ["arcana"], speciesFeats: [{ name: "Origin Tough" }],
    });
    expect(c.proficiencies.skills).toContain("arcana");
    expect(c.features.some((f) => f.name === "Origin Tough" && f.source === "Especie (dote)")).toBe(true);
  });
});
