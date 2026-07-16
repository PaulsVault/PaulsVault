import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };

beforeAll(async () => {
  await importPack({
    id: "test-ancestry", name: "ancestria test", version: "1.0.0", source: "test", entries: [
      { id: "species:goliath-test", type: "species", name: "Goliath Test", data: {
        size: "Medium", speed: 35, traits: [],
        ancestryChoices: [{ trait: "Giant Ancestry", options: [
          { name: "Fire's Burn", description: "1d10 de fuego al golpear." },
          { name: "Stone's Endurance", description: "Reacción para reducir daño." },
        ] }],
      } },
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
});
