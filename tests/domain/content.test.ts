import { beforeEach, describe, expect, it } from "vitest";
import {
  getContentEntry, importPack, listContentPacks, removePack, searchContent,
} from "../../src/domain/content.js";
import { DomainError } from "../../src/domain/errors.js";
import type { ContentPack } from "../../src/types.js";

// El SRD viene empaquetado (srd-core, srd-52-reference, srd-subclasses); el homebrew vive en la DB.
const BUNDLED = new Set(["srd-core", "srd-52-reference", "srd-subclasses"]);

beforeEach(async () => {
  for (const p of listContentPacks()) if (!BUNDLED.has(p.id)) await removePack(p.id);
});

describe("búsqueda y lectura", () => {
  it("lista las 15 condiciones del SRD", () => {
    expect(searchContent("", { type: "condition" }).total).toBe(15);
  });

  it("filtra hechizos por texto", () => {
    expect(searchContent("fire", { type: "spell" }).results.some((e) => e.name === "Fire Bolt")).toBe(true);
  });

  it("getContentEntry devuelve la entrada o lanza not_found", () => {
    expect(getContentEntry("Longsword", "item").type).toBe("item");
    expect(() => getContentEntry("no-existe-xyz")).toThrowError(DomainError);
  });

  it("deduplica por nombre y prefiere el pack 2024 sobre el SRD", async () => {
    await importPack({
      id: "dnd2024-test", name: "2024 test", version: "1.0.0", source: "test",
      entries: [{ id: "spell:fireball-xphb", type: "spell", name: "Fireball", data: { level: 3, summary: "versión 2024" } }],
    });
    const fireballs = searchContent("Fireball", { type: "spell" }).results.filter((r) => r.name.toLowerCase() === "fireball");
    expect(fireballs.length).toBe(1); // no duplicado con el Fireball de srd-core
    expect(fireballs[0].pack).toBe("dnd2024-test"); // gana el 2024
    expect(getContentEntry("Fireball", "spell").pack).toBe("dnd2024-test");
    await removePack("dnd2024-test");
  });
});

describe("gestión de packs (biblioteca ilimitada)", () => {
  const pack: ContentPack = {
    id: "test-hb", name: "Homebrew de prueba", version: "1.0.0", source: "Homebrew",
    entries: [{ id: "spell:rayo-x", type: "spell", name: "Rayo X", data: { level: 2, classes: ["Wizard"] } }],
  };

  it("importa un pack y su contenido aparece en la búsqueda", async () => {
    await importPack(pack);
    expect(listContentPacks().some((p) => p.id === "test-hb")).toBe(true);
    expect(searchContent("Rayo X").results.some((e) => e.name === "Rayo X")).toBe(true);
  });

  it("reimportar el mismo id actualiza (no duplica)", async () => {
    await importPack(pack);
    await importPack({ ...pack, version: "2.0.0" });
    expect(listContentPacks().filter((p) => p.id === "test-hb")).toHaveLength(1);
    expect(listContentPacks().find((p) => p.id === "test-hb")?.version).toBe("2.0.0");
  });

  it("rechaza un pack sin entradas", async () => {
    await expect(importPack({ id: "vacio", name: "Vacío", version: "1", source: "x", entries: [] }))
      .rejects.toThrowError(DomainError);
  });

  it("removePack borra y luego lanza si no existe", async () => {
    await importPack(pack);
    expect((await removePack("test-hb")).removed).toBe(true);
    await expect(removePack("test-hb")).rejects.toThrowError(DomainError);
  });
});
