import { describe, expect, it } from "vitest";
import { spellMechanics } from "../../src/domain/spells.js";
import { findEntry } from "../../src/domain/content.js";

const mech = (name: string, castAt?: number) => {
  const e = findEntry(name, "spell");
  return spellMechanics((e?.data ?? {}) as Record<string, unknown>, castAt, e?.data?.["level"] as number | undefined);
};

describe("spellMechanics — extracción bilingüe del texto", () => {
  it("Fireball (ES): salvación DES, daño de fuego, esfera y upcasting", () => {
    const m = mech("Fireball", 5);
    expect(m.save).toBe("dex");
    expect(m.kind).toBe("damage");
    expect(m.damageType).toBe("Fuego");
    expect(m.baseDamage).toBe("8d6");
    expect(m.damage).toBe("10d6"); // +1d6 por nivel sobre 3, lanzado a nivel 5
    expect(m.shape).toBe("sphere");
    expect(m.areaSize).toBe(20);
  });

  it("Cure Wounds (ES): curación, no daño, con upcasting", () => {
    const m = mech("Cure Wounds", 3);
    expect(m.kind).toBe("heal");
    expect(m.baseDamage).toBe("2d8");
    expect(m.damage).toBe("6d8"); // +2d8 por nivel sobre 1, a nivel 3
  });

  it("Magic Missile (ES): impacto automático → sin salvación ni ataque", () => {
    const m = mech("Magic Missile");
    expect(m.save).toBeUndefined();
    expect(m.attack).toBeUndefined();
  });

  it("Cone of Cold (EN): salvación CON, cono, daño de frío", () => {
    const m = mech("Cone of Cold");
    expect(m.save).toBe("con");
    expect(m.shape).toBe("cone");
    expect(m.damageType).toBe("Frío");
  });
});
