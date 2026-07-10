import { describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import type { Abilities, Database } from "../../src/types.js";

const BASE: Abilities = { str: 10, dex: 14, con: 12, int: 15, wis: 13, cha: 8 };
const mk = (over: Partial<Parameters<typeof createCharacter>[1]>) =>
  createCharacter({ characters: [] } as Database, {
    name: "T" + Math.random(), className: "Wizard", species: "Human", background: "Sage", abilities: BASE, ...over,
  });

describe("creación de personaje 2024", () => {
  it("aplica el bono +2/+1 del trasfondo sobre las puntuaciones base", () => {
    const c = mk({ abilityBonuses: { int: 2, wis: 1 } });
    expect(c.abilities.int).toBe(17); // 15 + 2
    expect(c.abilities.wis).toBe(14); // 13 + 1
    expect(c.abilities.dex).toBe(14); // sin bono
  });

  it("suma las competencias del trasfondo (habilidades + herramienta) a las de clase", () => {
    const c = mk({ skills: ["investigation"] });
    expect(c.proficiencies.skills).toContain("investigation"); // elegida de la clase
    expect(c.proficiencies.skills).toContain("arcana");        // fija del trasfondo Sage
    expect(c.proficiencies.skills).toContain("history");
    expect(c.proficiencies.tools.length).toBeGreaterThan(0);   // herramienta del trasfondo
  });

  it("el bono de CON del trasfondo aumenta los PG máximos", () => {
    expect(mk({ abilityBonuses: { con: 2 } }).hp.max).toBeGreaterThan(mk({}).hp.max);
  });
});
