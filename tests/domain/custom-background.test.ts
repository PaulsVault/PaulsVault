import { describe, expect, it } from "vitest";
import { createCharacter } from "../../src/domain/characters.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 };

describe("trasfondo personalizado", () => {
  it("aplica competencias, herramienta, dote y bono elegidos a mano", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "Custom" + Math.random(), className: "Fighter", species: "Human",
      background: "Erudito Errante", abilities: ABIL,
      abilityBonuses: { str: 2, con: 1 },
      skills: ["athletics", "intimidation"],        // habilidades de clase
      backgroundSkills: ["arcana", "history"],       // competencias del trasfondo personalizado
      tools: ["Herramientas de calígrafo"],
      originFeat: "Alert",
    });

    // competencias del trasfondo, sumadas a las de clase
    expect(c.proficiencies.skills).toEqual(expect.arrayContaining(["arcana", "history", "athletics", "intimidation"]));
    expect(c.proficiencies.tools).toContain("Herramientas de calígrafo");
    // dote de origen
    expect(c.features.some((f) => f.name === "Alert" && f.source === "Trasfondo (dote de origen)")).toBe(true);
    // bono +2/+1 sobre las base
    expect(c.abilities.str).toBe(17);
    expect(c.abilities.con).toBe(15);
    // el trasfondo se guarda con su nombre a medida
    expect(c.background).toBe("Erudito Errante");
  });

  it("sin dote/herramienta, solo aplica las competencias", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "Custom2" + Math.random(), className: "Wizard", species: "Human",
      background: "Personalizado", abilities: ABIL, abilityBonuses: { int: 2, dex: 1 },
      backgroundSkills: ["investigation", "medicine"],
    });
    expect(c.proficiencies.skills).toEqual(expect.arrayContaining(["investigation", "medicine"]));
    expect(c.features.some((f) => f.source === "Trasfondo (dote de origen)")).toBe(false);
  });
});
