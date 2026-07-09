import { beforeEach, describe, expect, it } from "vitest";
// Store en memoria: los tests de dominio prueban lógica sobre `db`, no persistencia.
const loadDb = () => ({ characters: [] as never[] });
const saveDb = (_db: unknown): void => { void _db; };
import { createCharacter } from "../../src/domain/characters.js";
import {
  addEffect, applyCondition, applyDamage, deathSave, heal, removeCondition,
  rest, setTempHp, tickEffects,
} from "../../src/domain/combat.js";
import type { Abilities, Character } from "../../src/types.js";

const ABIL: Abilities = { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 };

function makeFighter(level = 1): Character {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  const c = createCharacter(db, { name: "Peleador", className: "Fighter", level, species: "Human", background: "Soldier", abilities: ABIL });
  c.hp = { max: 20, current: 20, temp: 0 };
  return c;
}

beforeEach(() => {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
});

describe("PG / daño / muerte", () => {
  it("los PG temporales absorben el daño primero", () => {
    const c = makeFighter();
    c.hp.temp = 5;
    const r = applyDamage(c, 8);
    expect(r.tempAbsorbed).toBe(5);
    expect(c.hp.current).toBe(17); // 20 - 3
  });

  it("caer a 0 aplica Unconscious y rompe concentración", () => {
    const c = makeFighter();
    c.hp.current = 6;
    c.spellcasting.concentratingOn = "Bless";
    c.effects.push({ id: "e1", name: "Bless", roundsRemaining: 10, minutesRemaining: null, concentration: true, appliesTo: "self" });
    const r = applyDamage(c, 6);
    expect(r.downed).toBe(true);
    expect(r.concentrationBroken).toBe("Bless");
    expect(c.conditions.some((x) => x.name === "Unconscious")).toBe(true);
    expect(c.spellcasting.concentratingOn).toBeNull();
  });

  it("daño masivo (exceso ≥ PG máx) = muerte instantánea, sin Unconscious", () => {
    const c = makeFighter();
    c.hp.current = 8;
    const r = applyDamage(c, 20); // overflow 12 ≥ max 20? no → recalcular
    // overflow = 20 - 8 = 12; max 20 → NO masivo. Ajustamos a un golpe brutal:
    expect(r.massiveDeath).toBe(false);
    const c2 = makeFighter();
    c2.hp = { max: 10, current: 6, temp: 0 };
    const r2 = applyDamage(c2, 20); // overflow 14 ≥ 10 → masivo
    expect(r2.massiveDeath).toBe(true);
  });

  it("recibir daño a 0 PG añade un fallo de salvación de muerte", () => {
    const c = makeFighter();
    c.hp.current = 0;
    const r = applyDamage(c, 3);
    expect(r.deathSaveFailAdded).toBe(true);
    expect(c.deathSaves.failures).toBe(1);
  });

  it("avisa la salvación de concentración con DC = máx(10, daño/2)", () => {
    const c = makeFighter();
    c.spellcasting.concentratingOn = "Bless";
    const r = applyDamage(c, 30);
    expect(r.concentrationSaveDC).toBe(15);
  });

  it("curar desde 0 revive y resetea salvaciones de muerte", () => {
    const c = makeFighter();
    c.hp.current = 0;
    c.conditions.push({ name: "Unconscious", source: "0 PG" });
    c.deathSaves = { successes: 1, failures: 2 };
    const r = heal(c, 5);
    expect(r.revived).toBe(true);
    expect(c.conditions.some((x) => x.name === "Unconscious")).toBe(false);
    expect(c.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  it("setTempHp conserva el mayor (no acumula)", () => {
    const c = makeFighter();
    setTempHp(c, 8);
    const r = setTempHp(c, 5);
    expect(r.replaced).toBe(false);
    expect(c.hp.temp).toBe(8);
  });
});

describe("death saves", () => {
  it("crítico (20 natural) revive con 1 PG", () => {
    const c = makeFighter();
    c.hp.current = 0;
    const r = deathSave(c, "critical");
    expect(r.revived).toBe(true);
    expect(c.hp.current).toBe(1);
  });

  it("pifia suma 2 fallos; 3 fallos = muerte", () => {
    const c = makeFighter();
    c.hp.current = 0;
    deathSave(c, "fumble");
    const r = deathSave(c, "failure");
    expect(c.deathSaves.failures).toBe(3);
    expect(r.dead).toBe(true);
  });
});

describe("condiciones", () => {
  it("devuelve el resumen de reglas de la condición", () => {
    const c = makeFighter();
    const r = applyCondition(c, "Restrained");
    expect(r.rules).toBeTruthy();
    expect(c.conditions.some((x) => x.name === "Restrained")).toBe(true);
  });

  it("Exhaustion se acumula por niveles y baja al retirar", () => {
    const c = makeFighter();
    applyCondition(c, "Exhaustion", { level: 2 });
    applyCondition(c, "Exhaustion", { level: 1 });
    expect(c.conditions.find((x) => x.name === "Exhaustion")?.level).toBe(3);
    removeCondition(c, "Exhaustion", { level: 1 });
    expect(c.conditions.find((x) => x.name === "Exhaustion")?.level).toBe(2);
  });

  it("una condición incapacitante rompe la concentración", () => {
    const c = makeFighter();
    c.spellcasting.concentratingOn = "Bless";
    const r = applyCondition(c, "Stunned");
    expect(r.broke).toBe("Bless");
    expect(c.spellcasting.concentratingOn).toBeNull();
  });
});

describe("efectos con duración", () => {
  it("tick expira los efectos que llegan a 0 rondas", () => {
    const c = makeFighter();
    addEffect(c, { name: "Veneno", rounds: 2 });
    addEffect(c, { name: "Aura", rounds: 5 });
    const r = tickEffects(c, 2);
    expect(r.expired).toContain("Veneno");
    expect(c.effects.map((e) => e.name)).toEqual(["Aura"]);
  });
});

describe("descansos", () => {
  it("descanso corto gasta dados de golpe y cura", () => {
    const c = makeFighter(3); // hitDice d10 x3
    c.hp = { max: 30, current: 5, temp: 0 };
    const r = rest(c, "short", 2);
    expect(c.hitDice[0].used).toBe(2);
    expect(c.hp.current).toBeGreaterThan(5);
    expect(r.type).toBe("short");
  });

  it("descanso largo cura al máximo, restaura slots, baja Exhaustion y limpia efectos", () => {
    const c = makeFighter(3);
    c.hp = { max: 30, current: 4, temp: 3 };
    c.spellcasting.slots = { "1": { max: 2, used: 2 } };
    applyCondition(c, "Exhaustion", { level: 2 });
    addEffect(c, { name: "Bless", concentration: true });
    rest(c, "long");
    expect(c.hp.current).toBe(30);
    expect(c.hp.temp).toBe(0);
    expect(c.spellcasting.slots["1"].used).toBe(0);
    expect(c.conditions.find((x) => x.name === "Exhaustion")?.level).toBe(1);
    expect(c.effects).toHaveLength(0);
    expect(c.spellcasting.concentratingOn).toBeNull();
  });
});
