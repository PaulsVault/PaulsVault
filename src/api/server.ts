// Servidor Express de la app: API REST (adaptadores finos sobre el dominio) + estáticos de la SPA.
// Errores de dominio (DomainError) se mapean a códigos HTTP. Las reglas viven solo en el dominio.

import express, { type Request, type Response, type NextFunction, type Express } from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { loadDb, saveDb, dataDir, listPacks, requestContext, getUserById } from "../store.js";
import { DomainError, STATUS_BY_CODE } from "../domain/errors.js";
import { verifyToken, signToken, SESSION_COOKIE, TOKEN_MAX_AGE_MS } from "../auth.js";
import { registerUser, loginUser } from "../domain/auth.js";
import * as chars from "../domain/characters.js";
import * as inv from "../domain/inventory.js";
import * as spells from "../domain/spells.js";
import * as combat from "../domain/combat.js";
import * as companions from "../domain/companions.js";
import * as checks from "../domain/checks.js";
import * as content from "../domain/content.js";
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
function onCharacter<T>(id: string, fn: (c: Character, db: Database) => T): T {
  const db = loadDb();
  const c = chars.requireCharacter(db, id);
  const result = fn(c, db);
  saveDb(db);
  return result;
}

const num = (v: unknown): number | undefined => (v === undefined ? undefined : Number(v));

export function buildApp(): Express {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  // ─── Sesión: fija el usuario y ejecuta el resto en el contexto del dueño ───
  app.use((req: Req, _res, next) => {
    const userId = verifyToken(cookies(req)[SESSION_COOKIE]);
    req.userId = userId;
    requestContext.run({ ownerId: userId }, () => next());
  });

  const setSession = (res: Response, userId: string) =>
    res.cookie(SESSION_COOKIE, signToken(userId), {
      httpOnly: true, sameSite: "lax", secure: process.env["NODE_ENV"] === "production",
      maxAge: TOKEN_MAX_AGE_MS, path: "/",
    });

  // ─── Auth (rutas públicas) ───
  app.post("/api/auth/register", (req: Req, res) => {
    const user = registerUser(req.body?.email, req.body?.password);
    setSession(res, user.id);
    res.status(201).json({ user });
  });
  app.post("/api/auth/login", (req: Req, res) => {
    const user = loginUser(req.body?.email, req.body?.password);
    setSession(res, user.id);
    res.json({ user });
  });
  app.post("/api/auth/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ ok: true });
  });
  app.get("/api/auth/me", (req: Req, res) => {
    const u = req.userId ? getUserById(req.userId) : undefined;
    if (!u) { res.status(401).json({ error: { code: "unauthorized", message: "No autenticado." } }); return; }
    res.json({ user: { id: u.id, email: u.email } });
  });

  app.get("/api/health", (_req, res) => res.json({ status: "ok", app: "dnd-app" }));

  // A partir de aquí, todo /api requiere sesión.
  app.use("/api", (req: Req, res, next) => {
    if (!req.userId) { res.status(401).json({ error: { code: "unauthorized", message: "Inicia sesión." } }); return; }
    next();
  });

  // ─── Personajes ───
  app.get("/api/characters", (_req, res) => res.json(chars.listCharacters(loadDb())));

  app.post("/api/characters", (req, res) => {
    const db = loadDb();
    const c = chars.createCharacter(db, req.body as chars.CreateCharacterInput);
    saveDb(db);
    res.status(201).json(characterSheet(c));
  });

  app.get("/api/characters/:id", (req, res) => {
    const c = chars.requireCharacter(loadDb(), req.params.id);
    const view = (req.query["view"] as chars.CharacterView) ?? "sheet";
    res.json(view === "sheet" ? characterSheet(c) : chars.getCharacterView(c, view));
  });

  app.patch("/api/characters/:id", (req, res) =>
    res.json(characterSheet(onCharacter(req.params.id, (c) => chars.updateCharacter(c, req.body as chars.UpdateCharacterInput)))));

  app.delete("/api/characters/:id", (req, res) => {
    const db = loadDb();
    const r = chars.deleteCharacter(db, req.params.id, req.query["confirm"] === "true" || req.body?.confirm === true);
    saveDb(db);
    res.json(r);
  });

  app.post("/api/characters/:id/level-up", (req, res) => {
    const r = onCharacter(req.params.id, (c) => chars.levelUp(c, req.body as chars.LevelUpInput));
    res.json({ className: r.className, classLevel: r.classLevel, levelTotal: r.levelTotal, hpGained: r.hpGained, isNewClass: r.isNewClass, sheet: characterSheet(r.character) });
  });

  app.get("/api/characters/:id/export", (req, res) =>
    res.json(chars.exportCharacter(chars.requireCharacter(loadDb(), req.params.id), (req.query["format"] as "json" | "markdown") ?? "json")));

  app.post("/api/characters/import", (req, res) => {
    const db = loadDb();
    const c = chars.importCharacter(db, req.body?.character ?? req.body);
    saveDb(db);
    res.status(201).json(characterSheet(c));
  });

  app.post("/api/characters/:id/duplicate", (req, res) => {
    const db = loadDb();
    const c = chars.duplicateCharacter(db, req.params.id);
    saveDb(db);
    res.status(201).json(characterSheet(c));
  });

  app.get("/api/characters/:id/modifiers", (req, res) =>
    res.json(computeActiveModifiers(chars.requireCharacter(loadDb(), req.params.id))));

  // ─── Inventario y dinero ───
  app.get("/api/characters/:id/inventory", (req, res) =>
    res.json(inv.inventoryView(chars.requireCharacter(loadDb(), req.params.id))));

  app.post("/api/characters/:id/inventory", (req, res) =>
    res.status(201).json(onCharacter(req.params.id, (c) => { inv.addItem(c, req.body.item, req.body.quantity ?? 1, req.body.details); return inv.inventoryView(c); })));

  app.patch("/api/characters/:id/inventory/:itemId", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => { inv.updateItem(c, req.params.itemId, req.body.quantity, req.body.details); return inv.inventoryView(c); })));

  app.delete("/api/characters/:id/inventory/:itemId", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => { inv.removeItem(c, req.params.itemId, num(req.query["quantity"]) ?? 1); return inv.inventoryView(c); })));

  for (const action of ["equip", "unequip", "attune", "unattune"] as const) {
    app.post(`/api/characters/:id/inventory/:itemId/${action}`, (req, res) =>
      res.json(onCharacter(req.params.id, (c) => {
        if (action === "equip") inv.equipItem(c, req.params.itemId);
        else if (action === "unequip") inv.unequipItem(c, req.params.itemId);
        else if (action === "attune") inv.attuneItem(c, req.params.itemId);
        else inv.unattuneItem(c, req.params.itemId);
        return inv.inventoryView(c);
      })));
  }

  app.patch("/api/characters/:id/currency", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => inv.adjustCurrency(c, req.body))));

  // ─── Hechizos ───
  app.get("/api/characters/:id/spells", (req, res) =>
    res.json(spells.spellcastingView(chars.requireCharacter(loadDb(), req.params.id))));

  app.post("/api/characters/:id/spells", (req, res) =>
    res.status(201).json(onCharacter(req.params.id, (c) => { spells.learnSpell(c, req.body.spell, req.body.level, req.body.alwaysPrepared); return spells.spellcastingView(c); })));

  app.delete("/api/characters/:id/spells/:name", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => { spells.forgetSpell(c, req.params.name); return spells.spellcastingView(c); })));

  app.post("/api/characters/:id/spells/prepare", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => { spells.prepareSpell(c, req.body.spell); return spells.spellcastingView(c); })));

  app.post("/api/characters/:id/spells/unprepare", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => { spells.unprepareSpell(c, req.body.spell); return spells.spellcastingView(c); })));

  app.post("/api/characters/:id/spells/cast", (req, res) => {
    const out = onCharacter(req.params.id, (c) => ({ result: spells.castSpell(c, req.body as spells.CastSpellInput), view: spells.spellcastingView(c) }));
    res.json({ ...out.result, spellcasting: out.view });
  });

  app.patch("/api/characters/:id/spell-slots", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => {
      const { action, slots, level, amount } = req.body;
      if (action === "set_max") spells.setMaxSlots(c, slots);
      else if (action === "spend") spells.spendSlot(c, level, amount);
      else if (action === "recover") spells.recoverSlot(c, level, amount);
      else if (action === "recover_all") spells.recoverAllSlots(c);
      else throw new DomainError("validation", "action inválida: set_max|spend|recover|recover_all.");
      return spells.spellcastingView(c);
    })));

  // ─── Combate ───
  app.post("/api/characters/:id/hp", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => {
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

  app.post("/api/characters/:id/conditions", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => {
      const { action, condition, level, source, companion } = req.body;
      if (action === "apply") return combat.applyCondition(c, condition, { level, source, companion });
      if (action === "remove") return combat.removeCondition(c, condition, { level, companion });
      return { conditions: companion ? undefined : c.conditions };
    })));

  app.post("/api/characters/:id/effects", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => {
      const { action, name, description, rounds, concentration, companion } = req.body;
      if (action === "add") combat.addEffect(c, { name, description, rounds, concentration, companion });
      else if (action === "remove") combat.removeEffect(c, name);
      else if (action === "tick") return { ...combat.tickEffects(c, rounds ?? 1), combat: combat.combatView(c) };
      else if (action === "break_concentration") combat.breakConcentration(c);
      return combat.combatView(c);
    })));

  app.post("/api/characters/:id/rest", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => combat.rest(c, req.body.type, req.body.hitDiceToSpend ?? 0))));

  // ─── Compañeros ───
  app.get("/api/characters/:id/companions", (req, res) =>
    res.json(companions.companionsView(chars.requireCharacter(loadDb(), req.params.id))));

  app.post("/api/characters/:id/companions", (req, res) =>
    res.status(201).json(onCharacter(req.params.id, (c) => { companions.createCompanion(c, req.body); return companions.companionsView(c); })));

  app.patch("/api/characters/:id/companions/:cid", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => { companions.updateCompanion(c, req.params.cid, req.body); return companions.companionsView(c); })));

  app.delete("/api/characters/:id/companions/:cid", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => companions.deleteCompanion(c, req.params.cid))));

  app.post("/api/characters/:id/companions/:cid/damage", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => companions.damageCompanion(c, req.params.cid, req.body.amount))));

  app.post("/api/characters/:id/companions/:cid/heal", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => companions.healCompanion(c, req.params.cid, req.body.amount))));

  // ─── Dados y pruebas ───
  app.post("/api/roll", (req, res) =>
    res.json({ rolls: checks.rollDice(req.body.expression, req.body.advantage ?? "normal", req.body.times ?? 1) }));

  app.post("/api/characters/:id/check", (req, res) =>
    res.json(checks.check(chars.requireCharacter(loadDb(), req.params.id), req.body as checks.CheckInput)));

  // ─── Estilo ───
  app.patch("/api/characters/:id/style", (req, res) =>
    res.json(onCharacter(req.params.id, (c) => customizeStyle(c, req.body))));

  // ─── Contenido y packs ───
  app.get("/api/content", (req, res) =>
    res.json(content.searchContent(String(req.query["query"] ?? ""), {
      type: req.query["type"] as ContentType | undefined,
      spellLevel: num(req.query["spellLevel"]),
      spellClass: req.query["spellClass"] as string | undefined,
      limit: num(req.query["limit"]),
    })));

  app.get("/api/content/:idOrName", (req, res) =>
    res.json(content.getContentEntry(req.params.idOrName, req.query["type"] as ContentType | undefined)));

  app.get("/api/content-packs", (_req, res) => res.json(content.listContentPacks()));
  app.post("/api/content-packs", (req, res) => res.status(201).json(content.importPack(req.body)));
  app.delete("/api/content-packs/:id", (req, res) => res.json(content.removePack(req.params.id)));

  // ─── Entrega a terceros (.dndchar) ───
  app.post("/api/characters/:id/package", (req, res) => res.json(sharing.packageCharacter(loadDb(), req.params.id)));
  app.post("/api/characters/export-batch", (req, res) => res.json(sharing.packageBatch(loadDb(), req.body.ids ?? [])));
  app.post("/api/characters/import-package", (req, res) => {
    const db = loadDb();
    const r = sharing.importPackage(db, req.body, { overwritePacks: req.query["overwrite"] === "true" });
    saveDb(db);
    res.status(201).json(r);
  });

  // ─── Sistema ───
  app.get("/api/server-info", (_req, res) => {
    const db = loadDb();
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
