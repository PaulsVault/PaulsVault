import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildApp } from "../../src/api/server.js";

let server: Server;
let base = "";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  return { status: res.status, body: await res.json() as Record<string, unknown> };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = buildApp().listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server?.close(); });

describe("API smoke", () => {
  it("health responde ok", async () => {
    const { status, body } = await api("/api/health");
    expect(status).toBe(200);
    expect(body["status"]).toBe("ok");
  });

  it("flujo: crear → hoja → equipar armadura recalcula CA → lanzar hechizo", async () => {
    const create = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name: "API Hero", className: "Wizard", species: "Human", background: "Sage", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 } }),
    });
    expect(create.status).toBe(201);
    expect(create.body["ac"]).toBe(12); // 10 + DES(+2)

    // añadir y equipar armadura del contenido SRD
    await api("/api/characters/API Hero/inventory", { method: "POST", body: JSON.stringify({ item: "Leather Armor" }) });
    // localizar el id del objeto
    const inv = await api("/api/characters/API Hero/inventory");
    const items = inv.body["inventory"] as { id: string; name: string }[];
    const armorId = items.find((i) => i.name === "Leather Armor")!.id;
    await api(`/api/characters/API Hero/inventory/${armorId}/equip`, { method: "POST" });

    const sheet = await api("/api/characters/API Hero");
    expect(sheet.body["ac"]).toBe(13); // 11 (cuero) + DES(+2)

    // aprender y lanzar un hechizo (consume slot)
    await api("/api/characters/API Hero/spells", { method: "POST", body: JSON.stringify({ spell: "Magic Missile" }) });
    const cast = await api("/api/characters/API Hero/spells/cast", { method: "POST", body: JSON.stringify({ spell: "Magic Missile" }) });
    expect(cast.status).toBe(200);
    const sc = cast.body["spellcasting"] as { slots: Record<string, { used: number }> };
    expect(sc.slots["1"].used).toBe(1);
  });

  it("condición aplicada afecta la hoja (Restrained → velocidad 0)", async () => {
    await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name: "Atado", className: "Fighter", species: "Human", background: "Soldier", abilities: { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 } }),
    });
    await api("/api/characters/Atado/conditions", { method: "POST", body: JSON.stringify({ action: "apply", condition: "Restrained" }) });
    const sheet = await api("/api/characters/Atado");
    expect(sheet.body["speed"]).toBe(0);
  });

  it("error de dominio se mapea a código HTTP (nombre duplicado → 409)", async () => {
    const dup = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name: "API Hero", className: "Bard", species: "Human", background: "Sage", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }),
    });
    expect(dup.status).toBe(409);
  });

  it("búsqueda de contenido de la biblioteca ampliada", async () => {
    const { body } = await api("/api/content?query=fire&type=spell");
    const results = body["results"] as { name: string }[];
    expect(results.some((r) => r.name === "Fire Bolt")).toBe(true);
  });
});
