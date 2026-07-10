import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { buildApp } from "../../src/api/server.js";

let server: Server;
let base = "";
let cookie = "";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(base + path, {
    ...init,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...(init?.headers ?? {}) },
  });
  const setCookie = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

beforeAll(async () => {
  await new Promise<void>((resolve) => { server = buildApp().listen(0, resolve); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server?.close(); });

describe("API smoke (con auth)", () => {
  it("health es público; el resto exige sesión (401 sin login)", async () => {
    expect((await api("/api/health")).status).toBe(200);
    const unauth = await fetch(base + "/api/characters");
    expect(unauth.status).toBe(401);
  });

  it("registro inicia sesión y aísla los datos por usuario", async () => {
    const reg = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email: "smoke@test.com", password: "secret123" }) });
    expect(reg.status).toBe(201);
    expect(cookie).toContain("dnd_session");
    // recién registrado: sin personajes propios
    expect(await api("/api/characters").then((r) => (r.body as unknown as unknown[]).length)).toBe(0);
  });

  it("flujo autenticado: crear → equipar armadura recalcula CA → lanzar hechizo", async () => {
    const create = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name: "API Hero", className: "Wizard", species: "Human", background: "Sage", abilities: { str: 8, dex: 14, con: 14, int: 16, wis: 12, cha: 10 } }),
    });
    expect(create.status).toBe(201);
    expect(create.body["ac"]).toBe(12);

    await api("/api/characters/API Hero/inventory", { method: "POST", body: JSON.stringify({ item: "Leather Armor" }) });
    const inv = await api("/api/characters/API Hero/inventory");
    const items = (inv.body["inventory"] as { id: string; name: string }[]);
    const armorId = items.find((i) => i.name === "Leather Armor")!.id;
    await api(`/api/characters/API Hero/inventory/${armorId}/equip`, { method: "POST" });
    expect((await api("/api/characters/API Hero")).body["ac"]).toBe(13);

    await api("/api/characters/API Hero/spells", { method: "POST", body: JSON.stringify({ spell: "Magic Missile" }) });
    const cast = await api("/api/characters/API Hero/spells/cast", { method: "POST", body: JSON.stringify({ spell: "Magic Missile" }) });
    const sc = cast.body["spellcasting"] as { slots: Record<string, { used: number }> };
    expect(sc.slots["1"].used).toBe(1);
  });

  it("condición aplicada afecta la hoja (Restrained → velocidad 0)", async () => {
    await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name: "Atado", className: "Fighter", species: "Human", background: "Soldier", abilities: { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 } }),
    });
    await api("/api/characters/Atado/conditions", { method: "POST", body: JSON.stringify({ action: "apply", condition: "Restrained" }) });
    expect((await api("/api/characters/Atado")).body["speed"]).toBe(0);
  });

  it("error de dominio → código HTTP (nombre duplicado → 409)", async () => {
    const dup = await api("/api/characters", {
      method: "POST",
      body: JSON.stringify({ name: "API Hero", className: "Bard", species: "Human", background: "Sage", abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }),
    });
    expect(dup.status).toBe(409);
  });

  it("búsqueda de contenido de la biblioteca ampliada", async () => {
    const { body } = await api("/api/content?query=fire&type=spell");
    expect((body["results"] as { name: string }[]).some((r) => r.name === "Fire Bolt")).toBe(true);
  });

  it("registro sin invitación se rechaza (el primer usuario ya existe)", async () => {
    const prev = cookie; cookie = "";
    const reg = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email: "sininvite@test.com", password: "secret123" }) });
    expect(reg.status).toBe(400);
    cookie = prev; // recupera la sesión del primer usuario (admin)
  });

  it("segundo usuario (con invitación del admin) no ve los personajes del primero", async () => {
    // smoke@test.com es el primer usuario → admin (bootstrap); genera una invitación
    const invite = await api("/api/admin/invites", { method: "POST", body: JSON.stringify({ label: "mesa" }) });
    expect(invite.status).toBe(201);
    const token = invite.body["token"] as string;

    cookie = ""; // cerrar sesión y registrar al segundo usuario con la invitación
    const reg = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email: "otro@test.com", password: "secret123", invite: token }) });
    expect(reg.status).toBe(201);
    const list = await api("/api/characters");
    expect((list.body as unknown as unknown[]).length).toBe(0); // no ve a "API Hero" ni "Atado"
  });

  it("la invitación es de un solo uso (reusarla falla)", async () => {
    cookie = "";
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: "smoke@test.com", password: "secret123" }) }); // admin
    const invite = await api("/api/admin/invites", { method: "POST", body: JSON.stringify({}) });
    const token = invite.body["token"] as string;
    cookie = "";
    const first = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email: "u1@test.com", password: "secret123", invite: token }) });
    expect(first.status).toBe(201);
    cookie = "";
    const second = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email: "u2@test.com", password: "secret123", invite: token }) });
    expect(second.status).toBe(409);
  });
});
