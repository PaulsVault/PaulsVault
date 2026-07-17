import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMonsterToEncounter, addNpcToEncounter, addPlayerToEncounter, newEncounter, sanitizeEncounter } from "../../src/domain/encounters.js";
import { createCharacter } from "../../src/domain/characters.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };

beforeAll(async () => {
  await importPack({
    id: "test-monster", name: "monstruo test", version: "1.0.0", source: "test", entries: [
      { id: "monster:goblin-test", type: "monster", name: "Goblin Test", data: {
        size: "Small", creatureType: "goblinoid", ac: 15, hp: { average: 7, formula: "2d6" }, speed: "30 ft",
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 }, saves: { dex: 4 }, cr: "1/4", xp: 50, pb: 2,
        traits: [], actions: [{ name: "Scimitar", description: "Melee.", attack: { bonus: 4, damage: "1d6+2" } }], bonusActions: [], reactions: [], legendary: [],
      } },
    ],
  });
});
afterAll(async () => { await removePack("test-monster"); });

describe("encuentros del DM", () => {
  it("añade N monstruos con PG/CA reales, iniciativa tirada y nombres numerados", () => {
    const enc = newEncounter("Test");
    const added = addMonsterToEncounter(enc, "Goblin Test", 3);
    expect(added.length).toBe(3);
    expect(enc.combatants.length).toBe(3);
    expect(added[0].ac).toBe(15);
    expect(added[0].hp.max).toBe(7);
    expect(added[0].initiative).toBeGreaterThanOrEqual(1 + 2); // d20 + dexMod(2)
    expect(enc.combatants[2].name).toContain("3");
  });

  it("enlaza un jugador con CA y PG de su hoja", () => {
    const c = createCharacter({ characters: [] } as Database, { name: "Hero" + Math.random(), className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
    const enc = newEncounter();
    const p = addPlayerToEncounter(enc, c);
    expect(p.kind).toBe("player");
    expect(p.name).toBe(c.name);
    expect(p.hp.max).toBe(c.hp.max);
    expect(p.initiativeBonus).toBe(2); // dexMod 14
  });

  it("añade un NPC manual y sanea PG/turno", () => {
    const enc = newEncounter();
    addNpcToEncounter(enc, "Bandido", 12, 8, 15);
    enc.combatants[0].hp.current = 999; enc.turnIndex = 50;
    sanitizeEncounter(enc);
    expect(enc.combatants[0].name).toBe("Bandido");
    expect(enc.turnIndex).toBe(0);
  });
});
