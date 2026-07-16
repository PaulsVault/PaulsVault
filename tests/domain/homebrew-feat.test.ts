import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCharacter, grantFeat } from "../../src/domain/characters.js";
import { computeActiveModifiers } from "../../src/domain/modifiers.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 12, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };

beforeAll(async () => {
  await importPack({
    id: "test-hb-feat", name: "dotes homebrew test", version: "1.0.0", source: "test", entries: [
      { id: "feat:dote-test", type: "feat", name: "Dote Test", data: {
        summary: "Dote de prueba.", category: "O",
        mechanics: [{ target: "ac", op: "add", value: 2 }, { target: "save", op: "advantage", ability: "dex" }],
        abilityBonus: { str: 1 },
        skills: ["stealth"],
        uses: { max: 3, recharge: "long_rest" },
      } },
    ],
  });
});
afterAll(async () => { await removePack("test-hb-feat"); });

describe("dotes homebrew con efectos que interactúan con la hoja", () => {
  it("al tomar la dote aplica bono a característica, competencias y usos", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "H" + Math.random(), className: "Fighter", species: "Human",
      background: "Personalizado", abilities: ABIL, originFeat: "Dote Test",
    });
    expect(c.abilities.str).toBe(13); // 12 + 1
    expect(c.proficiencies.skills).toContain("stealth");
    const feat = c.features.find((f) => f.name === "Dote Test");
    expect(feat?.uses).toEqual({ max: 3, used: 0, recharge: "long_rest" });
  });

  it("las mecánicas del contenido se aplican en la hoja (CA y ventaja en salvación)", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "H" + Math.random(), className: "Fighter", species: "Human",
      background: "Personalizado", abilities: ABIL, originFeat: "Dote Test",
    });
    const m = computeActiveModifiers(c);
    expect(m.ac.final).toBe(m.ac.base + 2);
    expect(m.saves.dex.mode).toBe("advantage");
  });

  it("grantFeat otorga la dote en cualquier momento y aplica sus efectos; no permite duplicar", () => {
    const c = createCharacter({ characters: [] } as Database, {
      name: "H" + Math.random(), className: "Fighter", species: "Human", background: "Personalizado", abilities: ABIL,
    });
    grantFeat(c, "Dote Test");
    expect(c.features.some((f) => f.name === "Dote Test" && f.source === "Regalo de campaña")).toBe(true);
    expect(computeActiveModifiers(c).ac.final).toBe(computeActiveModifiers(c).ac.base + 2);
    expect(() => grantFeat(c, "Dote Test")).toThrow();
  });
});
