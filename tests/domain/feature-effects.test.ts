import { describe, expect, it } from "vitest";
import { createCharacter, levelUp } from "../../src/domain/characters.js";
import { computeActiveModifiers } from "../../src/domain/modifiers.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 16, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };
const fighter = (level: number) => createCharacter({ characters: [] } as Database,
  { name: `F${level}`, className: "Fighter", level, species: "Human", background: "Soldier", abilities: ABIL });

describe("efectos mecánicos de rasgos y dotes", () => {
  it("Champion (Improved Critical) baja el rango de crítico a 19", () => {
    const c = fighter(2);
    levelUp(c, { className: "Fighter", subclass: "Champion" }); // nivel 3
    expect(computeActiveModifiers(c).critRange).toBe(19);
  });

  it("Mobile suma +10 a la velocidad y Alert suma competencia a la iniciativa", () => {
    const c = fighter(3);
    c.features.push({ name: "Mobile", source: "Dote" });
    c.features.push({ name: "Alert", source: "Dote" });
    const m = computeActiveModifiers(c);
    expect(m.speed.final).toBe(c.speed + 10);
    expect(m.initiativeFlat).toBe(2); // bono de competencia a nivel 3
  });

  it("sin rasgos mecánicos: critRange 20 e initiativeFlat 0", () => {
    const c = createCharacter({ characters: [] } as Database,
      { name: "Mago", className: "Wizard", level: 1, species: "Human", background: "Sage", abilities: ABIL });
    const m = computeActiveModifiers(c);
    expect(m.critRange).toBe(20);
    expect(m.initiativeFlat).toBe(0);
  });
});
