import { beforeEach, describe, expect, it } from "vitest";
import { loadDb, saveDb } from "../../src/store.js";
import { createCharacter } from "../../src/domain/characters.js";
import { learnSpell } from "../../src/domain/spells.js";
import { importPack, listContentPacks, removePack } from "../../src/domain/content.js";
import { importPackage, packageBatch, packageCharacter } from "../../src/domain/sharing.js";
import { DomainError } from "../../src/domain/errors.js";
import type { Abilities, ContentPack, Database } from "../../src/types.js";

const ABIL: Abilities = { str: 8, dex: 14, con: 12, int: 16, wis: 12, cha: 10 };

const HB: ContentPack = {
  id: "myhb", name: "Homebrew propio", version: "1.0.0", source: "Homebrew",
  entries: [{ id: "spell:rayo-custom", type: "spell", name: "Rayo Custom", data: { level: 1, classes: ["Wizard"] } }],
};

function reset(): Database {
  const db = loadDb();
  db.characters = [];
  saveDb(db);
  for (const p of listContentPacks()) if (p.id !== "srd-core" && p.id !== "srd-52-reference") removePack(p.id);
  return db;
}

beforeEach(() => { reset(); });

function seededWizardWithHomebrew(): Database {
  const db = loadDb();
  importPack(HB);
  const c = createCharacter(db, { name: "Portador", className: "Wizard", species: "Human", background: "Sage", abilities: ABIL });
  learnSpell(c, "Rayo Custom");
  saveDb(db);
  return db;
}

describe("packageCharacter", () => {
  it("incluye el pack homebrew referenciado y NO los oficiales", () => {
    const db = seededWizardWithHomebrew();
    const pkg = packageCharacter(db, "Portador");
    expect(pkg.format).toBe("dndchar");
    expect(pkg.characters).toHaveLength(1);
    const ids = pkg.contentPacks.map((p) => p.id);
    expect(ids).toContain("myhb");
    expect(ids).not.toContain("srd-core");
    expect(ids).not.toContain("srd-52-reference");
  });
});

describe("importPackage", () => {
  it("instala el pack referenciado y crea el personaje con id nuevo", () => {
    const db = seededWizardWithHomebrew();
    const pkg = packageCharacter(db, "Portador");
    // simula a quien recibe: sin ese pack ni ese personaje
    removePack("myhb");
    db.characters = [];
    saveDb(db);

    const res = importPackage(db, pkg);
    expect(res.packsInstalled).toContain("myhb");
    expect(listContentPacks().some((p) => p.id === "myhb")).toBe(true);
    expect(res.characters).toHaveLength(1);
    expect(db.characters).toHaveLength(1);
  });

  it("no pisa un pack propio existente salvo overwrite", () => {
    const db = seededWizardWithHomebrew();
    const pkg = packageCharacter(db, "Portador");
    const res = importPackage(db, pkg); // myhb ya existe
    expect(res.packsSkipped).toContain("myhb");
  });

  it("rechaza un paquete inválido", () => {
    const db = loadDb();
    expect(() => importPackage(db, { foo: 1 })).toThrowError(DomainError);
  });
});

describe("packageBatch", () => {
  it("empaqueta varios personajes en un solo archivo", () => {
    const db = loadDb();
    createCharacter(db, { name: "Uno", className: "Fighter", species: "Human", background: "Soldier", abilities: ABIL });
    createCharacter(db, { name: "Dos", className: "Rogue", species: "Halfling", background: "Criminal", abilities: ABIL });
    const pkg = packageBatch(db, ["Uno", "Dos"]);
    expect(pkg.characters).toHaveLength(2);
  });
});
