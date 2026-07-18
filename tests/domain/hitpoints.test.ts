import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bonusHitPoints, createCharacter, grantFeat, levelDown, levelUp } from "../../src/domain/characters.js";
import { importPack, removePack } from "../../src/domain/content.js";
import type { Abilities, Database } from "../../src/types.js";

// CON 16 → mod +3. Clase d6 (como Sorcerer) para reproducir el caso del usuario.
const ABIL: Abilities = { str: 8, dex: 14, con: 16, int: 10, wis: 12, cha: 15 };
const db = (): Database => ({ characters: [] });

beforeAll(async () => {
  await importPack({
    id: "test-hp", name: "hp test", version: "1.0.0", source: "test", entries: [
      { id: "class:d6caster", type: "class", name: "D6 Caster", data: { hitDie: 6, saves: ["con", "cha"], weapons: ["simple"], casterType: "full" } },
      // Dote Tough: +2 PG por nivel de personaje.
      { id: "feat:tough-test", type: "feat", name: "Tough Test", data: { category: "G", summary: "Your Hit Point maximum increases by an amount equal to twice your character level when you gain this feat. Whenever you gain a character level thereafter, your Hit Point maximum increases by an additional 2 Hit Points.", hpPerLevel: 2 } },
      // Especie enana: Dureza Enana +1 PG por nivel de personaje.
      { id: "species:dwarf-test", type: "species", name: "Dwarf Test", data: { size: "Medium", speed: 30, traits: ["Dwarven Toughness: Your Hit Point maximum increases by 1, and it increases by 1 again whenever you gain a level."], hpPerLevel: 1 } },
      // Subclase con Resiliencia Dracónica: +1 PG por nivel de clase (base 3 a nivel 3).
      { id: "subclass:draconic-test", type: "subclass", name: "Draconic Test", data: { class: "D6 Caster", features: [], hpPerLevel: 1 } },
      // Especie neutra sin bono.
      { id: "species:plain-test", type: "species", name: "Plain Test", data: { size: "Medium", speed: 30, traits: [] } },
    ],
  });
});
afterAll(async () => { await removePack("test-hp"); });

describe("PG con dotes, rasgos y subclases", () => {
  it("crear a nivel 1 con Dureza Enana + Tough suma los bonos (9 base +1 +2 = 12)", () => {
    const c = createCharacter(db(), { name: "H" + Math.random(), className: "D6 Caster", level: 1, species: "Dwarf Test", background: "NoBg", abilities: ABIL, originFeat: "Tough Test" });
    // base d6 nivel 1 = 6 + 3 = 9; Dureza Enana +1; Tough +2 → 12.
    expect(c.hp.max).toBe(12);
    expect(c.hp.current).toBe(12);
    expect(bonusHitPoints(c)).toBe(3);
  });

  it("crear directo a nivel 20 con Dureza Enana + Tough incluye el bono ×nivel", () => {
    const c = createCharacter(db(), { name: "H" + Math.random(), className: "D6 Caster", level: 20, species: "Dwarf Test", background: "NoBg", abilities: ABIL, originFeat: "Tough Test" });
    // base = 9 + 19×(promedio 4 + 3) = 9 + 133 = 142; bono = (2+1)×20 = 60 → 202.
    expect(bonusHitPoints(c)).toBe(60);
    expect(c.hp.max).toBe(202);
  });

  it("subir de nivel a 3 y elegir subclase dracónica: base 27 + Tough/Dureza/Dracónica = 39 (tirando 6)", () => {
    // Reproduce el caso del usuario: D6, CON 16, Dureza Enana + Tough, tirando 6 en el dado cada nivel.
    const c = createCharacter(db(), { name: "H" + Math.random(), className: "D6 Caster", level: 1, species: "Dwarf Test", background: "NoBg", abilities: ABIL, originFeat: "Tough Test" });
    expect(c.hp.max).toBe(12); // nivel 1
    levelUp(c, { className: "D6 Caster", hpRoll: 6 });                                  // nivel 2
    expect(c.hp.max).toBe(24); // 12 + (6+3 base) + (Tough2+Dureza1) = 12 + 9 + 3
    const r = levelUp(c, { className: "D6 Caster", subclass: "Draconic Test", hpRoll: 6 }); // nivel 3 + subclase
    // + base 9 + (Tough2+Dureza1) 3 + Dracónica (1×3=3) = +15 → 39.
    expect(c.hp.max).toBe(39);
    expect(r.hpGained).toBe(15);
  });

  it("una dote de PG fija (+40) se suma una sola vez", async () => {
    await importPack({ id: "test-hp-flat", name: "flat", version: "1.0.0", source: "test", entries: [
      { id: "feat:fort-test", type: "feat", name: "Fort Test", data: { category: "EB", summary: "Your Hit Point maximum increases by 40.", hpFlat: 40 } },
    ] });
    const c = createCharacter(db(), { name: "H" + Math.random(), className: "D6 Caster", level: 5, species: "Plain Test", background: "NoBg", abilities: ABIL });
    const before = c.hp.max;
    grantFeat(c, "Fort Test");
    expect(c.hp.max).toBe(before + 40);
    await removePack("test-hp-flat");
  });

  it("bajar de nivel revierte el bono de PG", () => {
    const c = createCharacter(db(), { name: "H" + Math.random(), className: "D6 Caster", level: 3, species: "Dwarf Test", background: "NoBg", abilities: ABIL, subclass: "Draconic Test", originFeat: "Tough Test" });
    const at3 = c.hp.max;
    levelDown(c, "D6 Caster"); // 3 → 2: pierde subclase (Dracónica) y un nivel de Tough/Dureza
    expect(c.hp.max).toBeLessThan(at3);
    expect(bonusHitPoints(c)).toBe(6); // nivel 2, sin subclase: Tough 2×2 + Dureza 1×2 = 6
  });
});
