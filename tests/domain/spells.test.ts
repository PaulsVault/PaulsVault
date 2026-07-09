import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, saveDb } from "../../src/store.js";
import { createCharacter } from "../../src/domain/characters.js";
import {
  castSpell, learnSpell, prepareSpell, recoverAllSlots, unprepareSpell,
} from "../../src/domain/spells.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 8, dex: 14, con: 12, int: 16, wis: 16, cha: 10 };

function makeCaster(name: string, className: string): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  return createCharacter(db, { name, className, level: 3, species: "Human", background: "Sage", abilities: ABIL });
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

describe("learn / prepare", () => {
  it("un truco queda siempre preparado", () => {
    const c = makeCaster("Mago", "Wizard");
    const s = learnSpell(c, "Fire Bolt");
    expect(s.level).toBe(0);
    expect(s.alwaysPrepared).toBe(true);
  });

  it("aprender sin nivel ni contenido lanza validation", () => {
    const c = makeCaster("Mago", "Wizard");
    expect(() => learnSpell(c, "Conjuro Inexistente XYZ")).toThrowError(DomainError);
  });

  it("no permite despreparar un truco (siempre preparado)", () => {
    const c = makeCaster("Mago", "Wizard");
    learnSpell(c, "Fire Bolt");
    expect(() => unprepareSpell(c, "Fire Bolt")).toThrowError(DomainError);
  });

  it("prepara y despreparara un hechizo normal", () => {
    const c = makeCaster("Mago", "Wizard");
    learnSpell(c, "Magic Missile");
    prepareSpell(c, "Magic Missile");
    expect(c.spellcasting.known.find((s) => s.name === "Magic Missile")?.prepared).toBe(true);
    unprepareSpell(c, "Magic Missile");
    expect(c.spellcasting.known.find((s) => s.name === "Magic Missile")?.prepared).toBe(false);
  });
});

describe("cast", () => {
  it("consume slot y agota los slots disponibles", () => {
    const c = makeCaster("Mago", "Wizard"); // nivel 3 → slots {1:4, 2:2}
    learnSpell(c, "Magic Missile");
    castSpell(c, { spell: "Magic Missile" });
    expect(c.spellcasting.slots["1"].used).toBe(1);
    // agotar los 4 slots de nivel 1
    castSpell(c, { spell: "Magic Missile" });
    castSpell(c, { spell: "Magic Missile" });
    castSpell(c, { spell: "Magic Missile" });
    expect(() => castSpell(c, { spell: "Magic Missile" })).toThrowError(DomainError);
  });

  it("upcasting: lanzar a nivel superior consume el slot de ese nivel", () => {
    const c = makeCaster("Mago", "Wizard");
    learnSpell(c, "Magic Missile");
    const res = castSpell(c, { spell: "Magic Missile", level: 2 });
    expect(res.upcast).toBe(true);
    expect(res.castAt).toBe(2);
    expect(c.spellcasting.slots["2"].used).toBe(1);
  });

  it("no puede lanzar con un slot de nivel menor al del hechizo", () => {
    const c = makeCaster("Clériga", "Cleric");
    learnSpell(c, "Hold Person"); // nivel 2
    expect(() => castSpell(c, { spell: "Hold Person", level: 1 })).toThrowError(DomainError);
  });

  it("concentración: un nuevo conjuro de concentración rompe el anterior", () => {
    const c = makeCaster("Clériga", "Cleric");
    learnSpell(c, "Bless");        // nivel 1, concentración
    learnSpell(c, "Hold Person");  // nivel 2, concentración
    const r1 = castSpell(c, { spell: "Bless" });
    expect(r1.concentration).toBe(true);
    expect(c.spellcasting.concentratingOn).toBe("Bless");
    expect(c.effects.some((e) => e.name === "Bless")).toBe(true);

    const r2 = castSpell(c, { spell: "Hold Person" });
    expect(r2.concentrationBroken).toBe("Bless");
    expect(c.spellcasting.concentratingOn).toBe("Hold Person");
    expect(c.effects.some((e) => e.name === "Bless")).toBe(false);
  });

  it("expone DC de salvación y bono de ataque de conjuro", () => {
    const c = makeCaster("Mago", "Wizard"); // INT 16 (+3), comp +2 → DC 13, ataque +5
    learnSpell(c, "Magic Missile");
    const res = castSpell(c, { spell: "Magic Missile" });
    expect(res.saveDC).toBe(13);
    expect(res.attackBonus).toBe(5);
  });
});

describe("slots manuales", () => {
  it("recoverAllSlots resetea los usos", () => {
    const c = makeCaster("Mago", "Wizard");
    learnSpell(c, "Magic Missile");
    castSpell(c, { spell: "Magic Missile" });
    recoverAllSlots(c);
    expect(c.spellcasting.slots["1"].used).toBe(0);
  });
});
