// Servidor Express de la app: API REST (adaptadores finos sobre el dominio) + estáticos de la SPA.
// Persistencia asíncrona (libSQL). Errores de dominio (DomainError) → códigos HTTP.

import express, { type Request, type Response, type NextFunction, type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadDb, saveDb, dataDir, listPacks, requestContext, getUserById, init, loadEncounters, saveEncounter, deleteEncounterRow } from "../store.js";
import { DomainError, STATUS_BY_CODE } from "../domain/errors.js";
import { verifyToken, signToken, SESSION_COOKIE, TOKEN_MAX_AGE_MS } from "../auth.js";
import { dice3dFrom } from "../dice.js";
import { registerUser, loginUser } from "../domain/auth.js";
import { isAdmin, createInviteFor, listInviteViews, revokeInvite } from "../domain/invites.js";
import * as chars from "../domain/characters.js";
import * as inv from "../domain/inventory.js";
import * as spells from "../domain/spells.js";
import * as combat from "../domain/combat.js";
import * as masteries from "../domain/masteries.js";
import * as companions from "../domain/companions.js";
import * as checks from "../domain/checks.js";
import * as content from "../domain/content.js";
import * as encounters from "../domain/encounters.js";
import * as sharing from "../domain/sharing.js";
import { customizeStyle } from "../domain/style.js";
import { computeActiveModifiers } from "../domain/modifiers.js";
import { characterSheet } from "./sheet.js";
import type { Character, ContentType, Database } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Req = Request & { userId?: string | null };

/** Parseo simple de cookies (sin dependencias). */
function cookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  const raw = req.headers.cookie;
  if (raw) for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/** Carga db, resuelve el personaje, ejecuta `fn`, guarda y devuelve el resultado de `fn`. */
async function onCharacter<T>(id: string, fn: (c: Character, db: Database) => T): Promise<T> {
  const db = await loadDb();
  const c = chars.requireCharacter(db, id);
  const result = fn(c, db);
  await saveDb(db);
  return result;
}

// Carga los encuentros del dueño, localiza uno por id, aplica fn, y lo persiste.
async function onEncounter<T>(id: string, fn: (e: import("../types.js").Encounter) => T): Promise<T> {
  const list = await loadEncounters();
  const enc = encounters.requireEncounter(list, id);
  const result = fn(enc);
  await saveEncounter(enc);
  return result;
}

const num = (v: unknown): number | undefined => (v === undefined ? undefined : Number(v));

export function buildApp(): Express {
  const app = express();
  app.set("trust proxy", true); // respeta X-Forwarded-Proto (https en Vercel) para los enlaces de invitación
  app.use(express.json({ limit: "12mb" }));

  const baseUrl = (req: Request) => `${req.protocol}://${req.get("host")}`;

  // ─── Sesión: inicializa el store, fija el usuario y ejecuta en el contexto del dueño ───
  app.use((req: Req, _res, next) => {
    void (async () => {
      try {
        await init();
        req.userId = verifyToken(cookies(req)[SESSION_COOKIE]);
        requestContext.run({ ownerId: req.userId }, () => next());
      } catch (e) { next(e); }
    })();
  });

  const setSession = (res: Response, userId: string) =>
    res.cookie(SESSION_COOKIE, signToken(userId), {
      httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production",
      maxAge: TOKEN_MAX_AGE_MS, path: "/",
    });

  // ─── Auth (rutas públicas) ───
  app.post("/api/auth/register", async (req: Req, res) => {
    const user = await registerUser(req.body?.email, req.body?.password, req.body?.invite);
    setSession(res, user.id);
    res.status(201).json({ user });
  });
  app.post("/api/auth/login", async (req: Req, res) => {
    const user = await loginUser(req.body?.email, req.body?.password);
    setSession(res, user.id);
    res.json({ user });
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/auth/me", async (req: Req, res) => {
    const u = req.userId ? await getUserById(req.userId) : undefined;
    if (!u) { res.status(401).json({ error: { code: "unauthorized", message: "No autenticado." } }); return; }
    res.json({ user: { id: u.id, email: u.email }, isAdmin: await isAdmin(u.id) });
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "dnd-app" }));

  // A partir de aquí, todo /api requiere sesión.
  app.use("/api", (req: Req, res, next) => {
    if (!req.userId) { res.status(401).json({ error: { code: "unauthorized", message: "Inicia sesión." } }); return; }
    next();
  });

  // ─── Administración: invitaciones (solo admin) ───
  app.use("/api/admin", async (req: Req, res, next) => {
    if (!(await isAdmin(req.userId))) { res.status(403).json({ error: { code: "forbidden", message: "Solo el administrador puede gestionar invitaciones." } }); return; }
    next();
  });
  app.get("/api/admin/invites", async (req, res) => res.json({ invites: await listInviteViews(baseUrl(req)) }));
  app.post("/api/admin/invites", async (req: Req, res) =>
    res.status(201).json(await createInviteFor(req.userId!, req.body?.label, num(req.body?.expiresInDays), baseUrl(req))));
  app.delete("/api/admin/invites/:id", async (req, res) => { await revokeInvite(req.params.id); res.json({ ok: true }); });

  // ─── Personajes ───
  app.get("/api/characters", async (_req, res) => res.json(chars.listCharacters(await loadDb())));

  app.post("/api/characters", async (req, res) => {
    const db = await loadDb();
    const c = chars.createCharacter(db, req.body as chars.CreateCharacterInput);
    await saveDb(db);
    res.status(201).json(characterSheet(c));
  });

  app.get("/api/characters/:id", async (req, res) => {
    const c = chars.requireCharacter(await loadDb(), req.params.id);
    const view = (req.query["view"] as chars.CharacterView) ?? "sheet";
    res.json(view === "sheet" ? characterSheet(c) : chars.getCharacterView(c, view));
  });

  app.patch("/api/characters/:id", async (req, res) =>
    res.json(characterSheet(await onCharacter(req.params.id, (c) => chars.updateCharacter(c, req.body as chars.UpdateCharacterInput)))));

  app.delete("/api/characters/:id", async (req, res) => {
    const db = await loadDb();
    const r = chars.deleteCharacter(db, req.params.id, req.query["confirm"] === "true" || req.body?.confirm === true);
    await saveDb(db);
    res.json(r);
  });

  app.post("/api/characters/:id/level-up", async (req, res) => {
    const r = await onCharacter(req.params.id, (c) => chars.levelUp(c, req.body as chars.LevelUpInput));
    res.json({ className: r.className, classLevel: r.classLevel, levelTotal: r.levelTotal, hpGained: r.hpGained, isNewClass: r.isNewClass, sheet: characterSheet(r.character) });
  });

  app.post("/api/characters/:id/level-down", async (req, res) => {
    const r = await onCharacter(req.params.id, (c) => chars.levelDown(c, req.body?.className));
    res.json({ className: r.className, classLevel: r.classLevel, levelTotal: r.levelTotal, hpLost: r.hpLost, classRemoved: r.classRemoved, sheet: characterSheet(r.character) });
  });

  // Maestrías de arma (regla 2024): fijar las armas cuya propiedad de maestría conoce el personaje.
  app.post("/api/characters/:id/weapon-masteries", async (req, res) =>
    res.json(characterSheet(await onCharacter(req.params.id, (c) => masteries.setWeaponMasteries(c, (req.body?.weapons as string[]) ?? [])))));

  // Armas con maestría elegibles (competente + con propiedad de maestría) para el selector.
  app.get("/api/characters/:id/mastery-options", async (req, res) =>
    res.json({ max: masteries.weaponMasteryMax(chars.requireCharacter(await loadDb(), req.params.id)), options: masteries.eligibleMasteryWeapons(chars.requireCharacter(await loadDb(), req.params.id)) }));

  // Gastar/restaurar un uso de un rasgo con cargas (Ancestría del Goliath, dotes con usos…). delta ±1.
  app.post("/api/characters/:id/feature-use", async (req, res) =>
    res.json(characterSheet(await onCharacter(req.params.id, (c) => { combat.adjustFeatureUse(c, String(req.body?.feature ?? ""), Number(req.body?.delta ?? 1)); return c; }))));

  // Otorgar una dote en cualquier momento (regalo/buff de campaña). abilities: media dote elegida.
  app.post("/api/characters/:id/feats", async (req, res) =>
    res.json(characterSheet(await onCharacter(req.params.id, (c) => chars.grantFeat(c, String(req.body?.feat ?? ""), req.body?.source ? String(req.body.source) : undefined, req.body?.abilities as Record<string, number> | undefined)))));

  // Competencias que otorga una clase al multiclasear (para el asistente de subida de nivel).
  app.get("/api/multiclass/:className", (req, res) => res.json(chars.multiclassProficiencies(req.params.className)));

  // Elecciones de clase/subclase (estilo de combate, invocaciones, maniobras, metamagia…) a un nivel dado.
  app.get("/api/class-choices/:className/:level", (req, res) =>
    res.json({ choices: chars.classChoicesAt(req.params.className, Number(req.params.level), req.query["subclass"] as string | undefined) }));

  // Diario de campaña/sesión
  app.post("/api/characters/:id/journal", async (req, res) =>
    res.status(201).json(characterSheet(await onCharacter(req.params.id, (c) => { chars.addJournalEntry(c, req.body as chars.JournalInput); return c; }))));

  app.patch("/api/characters/:id/journal/:entryId", async (req, res) =>
    res.json(characterSheet(await onCharacter(req.params.id, (c) => { chars.updateJournalEntry(c, req.params.entryId, req.body as Partial<chars.JournalInput>); return c; }))));

  app.delete("/api/characters/:id/journal/:entryId", async (req, res) =>
    res.json(characterSheet(await onCharacter(req.params.id, (c) => { chars.deleteJournalEntry(c, req.params.entryId); return c; }))));

  app.get("/api/characters/:id/export", async (req, res) =>
    res.json(chars.exportCharacter(chars.requireCharacter(await loadDb(), req.params.id), (req.query["format"] as "json" | "markdown") ?? "json")));

  app.post("/api/characters/import", async (req, res) => {
    const db = await loadDb();
    const c = chars.importCharacter(db, req.body?.character ?? req.body);
    await saveDb(db);
    res.status(201).json(characterSheet(c));
  });

  app.post("/api/characters/:id/duplicate", async (req, res) => {
    const db = await loadDb();
    const c = chars.duplicateCharacter(db, req.params.id);
    await saveDb(db);
    res.status(201).json(characterSheet(c));
  });

  app.get("/api/characters/:id/modifiers", async (req, res) =>
    res.json(computeActiveModifiers(chars.requireCharacter(await loadDb(), req.params.id))));

  // ─── Inventario y dinero ───
  app.get("/api/characters/:id/inventory", async (req, res) =>
    res.json(inv.inventoryView(chars.requireCharacter(await loadDb(), req.params.id))));

  app.post("/api/characters/:id/inventory", async (req, res) =>
    res.status(201).json(await onCharacter(req.params.id, (c) => { inv.addItem(c, req.body.item, req.body.quantity ?? 1, req.body.details); return inv.inventoryView(c); })));

  app.patch("/api/characters/:id/inventory/:itemId", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { inv.updateItem(c, req.params.itemId, req.body.quantity, req.body.details); return inv.inventoryView(c); })));

  app.delete("/api/characters/:id/inventory/:itemId", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { inv.removeItem(c, req.params.itemId, num(req.query["quantity"]) ?? 1); return inv.inventoryView(c); })));

  for (const action of ["equip", "unequip", "attune", "unattune"] as const) {
    app.post(`/api/characters/:id/inventory/:itemId/${action}`, async (req, res) =>
      res.json(await onCharacter(req.params.id, (c) => {
        if (action === "equip") inv.equipItem(c, req.params.itemId);
        else if (action === "unequip") inv.unequipItem(c, req.params.itemId);
        else if (action === "attune") inv.attuneItem(c, req.params.itemId);
        else inv.unattuneItem(c, req.params.itemId);
        return inv.inventoryView(c);
      })));
  }

  app.post("/api/characters/:id/inventory/:itemId/use-charges", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { inv.useItemCharges(c, req.params.itemId, num(req.body?.amount) ?? 1); return inv.inventoryView(c); })));

  app.post("/api/characters/:id/inventory/:itemId/restore-charges", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { inv.restoreItemCharges(c, req.params.itemId, num(req.body?.amount)); return inv.inventoryView(c); })));

  app.post("/api/characters/:id/inventory/:itemId/cast", async (req, res) => {
    const out = await onCharacter(req.params.id, (c) => ({ result: inv.castItemSpell(c, req.params.itemId, req.body?.spell), view: inv.inventoryView(c) }));
    res.json({ ...out.result, inventory: out.view });
  });

  app.post("/api/characters/:id/inventory/:itemId/use", async (req, res) => {
    const out = await onCharacter(req.params.id, (c) => ({ result: inv.useItem(c, req.params.itemId), view: inv.inventoryView(c) }));
    res.json({ ...out.result, inventory: out.view });
  });

  app.patch("/api/characters/:id/currency", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => inv.adjustCurrency(c, req.body))));

  // ─── Hechizos ───
  app.get("/api/characters/:id/spells", async (req, res) =>
    res.json(spells.spellcastingView(chars.requireCharacter(await loadDb(), req.params.id))));

  app.post("/api/characters/:id/spells", async (req, res) =>
    res.status(201).json(await onCharacter(req.params.id, (c) => { spells.learnSpell(c, req.body.spell, req.body.level, req.body.alwaysPrepared); return spells.spellcastingView(c); })));

  app.delete("/api/characters/:id/spells/:name", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { spells.forgetSpell(c, req.params.name); return spells.spellcastingView(c); })));

  app.post("/api/characters/:id/spells/prepare", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { spells.prepareSpell(c, req.body.spell); return spells.spellcastingView(c); })));

  app.post("/api/characters/:id/spells/unprepare", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { spells.unprepareSpell(c, req.body.spell); return spells.spellcastingView(c); })));

  app.post("/api/characters/:id/spells/cast", async (req, res) => {
    const out = await onCharacter(req.params.id, (c) => ({ result: spells.castSpell(c, req.body as spells.CastSpellInput), view: spells.spellcastingView(c) }));
    res.json({ ...out.result, spellcasting: out.view });
  });

  app.patch("/api/characters/:id/spell-slots", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => {
      const { action, slots, level, amount } = req.body;
      if (action === "set_max") spells.setMaxSlots(c, slots);
      else if (action === "spend") spells.spendSlot(c, level, amount);
      else if (action === "recover") spells.recoverSlot(c, level, amount);
      else if (action === "recover_all") spells.recoverAllSlots(c);
      else throw new DomainError("validation", "action inválida: set_max|spend|recover|recover_all.");
      return spells.spellcastingView(c);
    })));

  // ─── Combate ───
  app.post("/api/characters/:id/hp", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => {
      const { action, amount, deathSaveResult } = req.body;
      let out: unknown = {};
      switch (action) {
        case "damage": out = combat.applyDamage(c, amount); break;
        case "heal": out = combat.heal(c, amount); break;
        case "set_temp": out = combat.setTempHp(c, amount); break;
        case "set_max": combat.setMaxHp(c, amount); break;
        case "death_save": out = combat.deathSave(c, deathSaveResult); break;
        case "stabilize": combat.stabilize(c); break;
        case "reset_death_saves": combat.resetDeathSaves(c); break;
        default: throw new DomainError("validation", "action inválida.");
      }
      return { result: out, combat: combat.combatView(c) };
    })));

  app.post("/api/characters/:id/conditions", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => {
      const { action, condition, level, source, companion } = req.body;
      if (action === "apply") return combat.applyCondition(c, condition, { level, source, companion });
      if (action === "remove") return combat.removeCondition(c, condition, { level, companion });
      return { conditions: companion ? undefined : c.conditions };
    })));

  app.post("/api/characters/:id/effects", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => {
      const { action, name, description, rounds, concentration, companion } = req.body;
      if (action === "add") combat.addEffect(c, { name, description, rounds, concentration, companion });
      else if (action === "remove") combat.removeEffect(c, name);
      else if (action === "tick") return { ...combat.tickEffects(c, rounds ?? 1), combat: combat.combatView(c) };
      else if (action === "break_concentration") combat.breakConcentration(c);
      return combat.combatView(c);
    })));

  app.post("/api/characters/:id/rest", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => combat.rest(c, req.body.type, req.body.hitDiceToSpend ?? 0))));

  // ─── Compañeros ───
  app.get("/api/characters/:id/companions", async (req, res) =>
    res.json(companions.companionsView(chars.requireCharacter(await loadDb(), req.params.id))));

  app.post("/api/characters/:id/companions", async (req, res) =>
    res.status(201).json(await onCharacter(req.params.id, (c) => { companions.createCompanion(c, req.body); return companions.companionsView(c); })));

  app.patch("/api/characters/:id/companions/:cid", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => { companions.updateCompanion(c, req.params.cid, req.body); return companions.companionsView(c); })));

  app.delete("/api/characters/:id/companions/:cid", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => companions.deleteCompanion(c, req.params.cid))));

  app.post("/api/characters/:id/companions/:cid/damage", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => companions.damageCompanion(c, req.params.cid, req.body.amount))));

  app.post("/api/characters/:id/companions/:cid/heal", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => companions.healCompanion(c, req.params.cid, req.body.amount))));

  // ─── Dados y pruebas ───
  app.post("/api/roll", (req, res) =>
    res.json({ rolls: checks.rollDice(req.body.expression, req.body.advantage ?? "normal", req.body.times ?? 1).map((r) => ({ ...r, dice3d: dice3dFrom(r) })) }));

  app.post("/api/characters/:id/check", async (req, res) =>
    res.json(checks.check(chars.requireCharacter(await loadDb(), req.params.id), req.body as checks.CheckInput)));

  // ─── Estilo ───
  app.patch("/api/characters/:id/style", async (req, res) =>
    res.json(await onCharacter(req.params.id, (c) => customizeStyle(c, req.body))));

  // ─── Homebrew (dotes propias del usuario, con efectos que interactúan con la hoja) ───
  app.post("/api/homebrew/feat", async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b["name"] ?? "").trim();
    const id = `feat:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const keep = (v: unknown) => (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) ? undefined : v);
    const data = {
      summary: keep(b["summary"]), category: keep(b["category"]), prerequisite: keep(b["prerequisite"]),
      mechanics: keep(b["mechanics"]), abilityBonus: keep(b["abilityBonus"]), skills: keep(b["skills"]),
      tools: keep(b["tools"]), uses: keep(b["uses"]), homebrew: true,
    };
    res.status(201).json(await content.saveHomebrewEntry({ id, type: "feat", name, data }));
  });
  app.post("/api/homebrew/item", async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b["name"] ?? "").trim();
    const id = `item:${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const keep = (v: unknown) => (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0) ? undefined : v);
    const n = (v: unknown) => (v === "" || v === undefined || v === null ? undefined : Number(v));
    const data = {
      itemType: keep(b["itemType"]) ?? "gear",
      weight: n(b["weight"]), cost: keep(b["cost"]), rarity: keep(b["rarity"]),
      requiresAttunement: b["requiresAttunement"] === true,
      description: keep(b["description"]),
      damage: keep(b["damage"]), weaponCategory: keep(b["weaponCategory"]), properties: keep(b["properties"]), magicBonus: n(b["magicBonus"]),
      armorClass: n(b["armorClass"]), armorCategory: keep(b["armorCategory"]),
      bonusAc: n(b["bonusAc"]), bonusSave: n(b["bonusSave"]), bonusSpellAttack: n(b["bonusSpellAttack"]), bonusSpellDc: n(b["bonusSpellDc"]),
      charges: n(b["charges"]), recharge: keep(b["recharge"]), rechargeAmount: keep(b["rechargeAmount"]), spells: keep(b["spells"]),
      homebrew: true,
    };
    res.status(201).json(await content.saveHomebrewEntry({ id, type: "item", name, data }));
  });
  app.delete("/api/homebrew/:id", async (req, res) => res.json(await content.deleteHomebrewEntry(req.params.id)));

  // ─── Contenido y packs ───
  app.get("/api/spells-catalog", (req, res) =>
    res.json({ spells: content.spellCatalog({ spellClass: req.query["class"] as string | undefined }) }));

  app.get("/api/monsters", (_req, res) => res.json({ monsters: content.monsterCatalog() }));

  // ─── Encuentros del DM (tracker de iniciativa/combate) ───
  app.get("/api/encounters", async (_req, res) => res.json({ encounters: await loadEncounters() }));
  app.post("/api/encounters", async (req, res) => {
    const enc = encounters.newEncounter(req.body?.name);
    await saveEncounter(enc);
    res.status(201).json(enc);
  });
  app.get("/api/encounters/:id", async (req, res) => res.json(encounters.requireEncounter(await loadEncounters(), req.params.id)));
  app.put("/api/encounters/:id", async (req, res) =>
    res.json(await onEncounter(req.params.id, (e) => {
      const b = (req.body ?? {}) as Partial<import("../types.js").Encounter>;
      if (Array.isArray(b.combatants)) e.combatants = b.combatants;
      if (typeof b.round === "number") e.round = b.round;
      if (typeof b.turnIndex === "number") e.turnIndex = b.turnIndex;
      if (typeof b.name === "string" && b.name.trim()) e.name = b.name.trim();
      return encounters.sanitizeEncounter(e);
    })));
  app.delete("/api/encounters/:id", async (req, res) => res.json({ removed: await deleteEncounterRow(req.params.id), id: req.params.id }));
  app.post("/api/encounters/:id/monster", async (req, res) =>
    res.json(await onEncounter(req.params.id, (e) => { encounters.addMonsterToEncounter(e, String(req.body?.monster ?? ""), Number(req.body?.count ?? 1)); return e; })));
  app.post("/api/encounters/:id/player", async (req, res) => {
    const c = chars.requireCharacter(await loadDb(), String(req.body?.characterId ?? ""));
    res.json(await onEncounter(req.params.id, (e) => { encounters.addPlayerToEncounter(e, c); return e; }));
  });
  app.post("/api/encounters/:id/npc", async (req, res) =>
    res.json(await onEncounter(req.params.id, (e) => {
      encounters.addNpcToEncounter(e, String(req.body?.name ?? "NPC"), Number(req.body?.ac ?? 10), Number(req.body?.hp ?? 1), req.body?.initiative != null ? Number(req.body.initiative) : null);
      return e;
    })));

  app.get("/api/content", (req, res) =>
    res.json(content.searchContent(String(req.query["query"] ?? ""), {
      type: req.query["type"] as ContentType | undefined,
      spellLevel: num(req.query["spellLevel"]),
      spellClass: req.query["spellClass"] as string | undefined,
      subclassOf: req.query["subclassOf"] as string | undefined,
      featCategory: req.query["featCategory"] as string | undefined,
      limit: num(req.query["limit"]),
    })));

  app.get("/api/content/:idOrName", (req, res) =>
    res.json(content.getContentEntry(req.params.idOrName, req.query["type"] as ContentType | undefined)));

  app.get("/api/content-packs", (_req, res) => res.json(content.listContentPacks()));
  app.post("/api/content-packs", async (req, res) => res.status(201).json(await content.importPack(req.body)));
  app.delete("/api/content-packs/:id", async (req, res) => res.json(await content.removePack(req.params.id)));

  // ─── Entrega a terceros (.dndchar) ───
  app.post("/api/characters/:id/package", async (req, res) => res.json(sharing.packageCharacter(await loadDb(), req.params.id)));
  app.post("/api/characters/export-batch", async (req, res) => res.json(sharing.packageBatch(await loadDb(), req.body.ids ?? [])));
  app.post("/api/characters/import-package", async (req, res) => {
    const db = await loadDb();
    const r = await sharing.importPackage(db, req.body, { overwritePacks: req.query["overwrite"] === "true" });
    await saveDb(db);
    res.status(201).json(r);
  });

  // ─── Sistema ───
  app.get("/api/server-info", async (_req, res) => {
    const db = await loadDb();
    res.json({
      dataDirectory: dataDir(),
      characters: db.characters.length,
      contentPacks: listPacks().map((p) => `${p.id} v${p.version} (${p.entries.length} entradas)`),
    });
  });

  // ─── SPA estática (si existe el build del frontend) ───
  const webDir = process.env["WEB_DIR"] ?? path.resolve(__dirname, "..", "..", "web", "dist");
  if (existsSync(webDir)) {
    app.use(express.static(webDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) return res.sendFile(path.join(webDir, "index.html"));
      next();
    });
  }

  // ─── Manejo de errores ───
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof DomainError) {
      res.status(STATUS_BY_CODE[err.code]).json({ error: { code: err.code, message: err.message } });
      return;
    }
    console.error(err);
    const message = err instanceof Error ? err.message : "Error interno";
    res.status(500).json({ error: { code: "internal", message } });
  });

  return app;
}
