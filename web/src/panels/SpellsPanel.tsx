import { useEffect, useState } from "react";
import { api } from "../api";
import { AreaGlyph } from "../AreaGlyph";
import { SpellBrowser } from "./SpellBrowser";
import { presentRoll } from "../rollPresenter";
import type { ContentHit, Sheet } from "../types";

interface Mech { kind?: string; save?: string; attack?: boolean; damage?: string; baseDamage?: string; damageType?: string; range?: string; shape?: string; areaSize?: number; area?: string; }
interface Known { name: string; level: number; prepared: boolean; alwaysPrepared?: boolean; concentration?: boolean; source: string; summary?: string; mechanics?: Mech; }
interface SpellView { saveDC: number | null; attackBonus: number | null; slots: Record<string, { max: number; used: number }>; pactSlots?: { level: number; max: number; used: number } | null; concentratingOn?: string | null; grantedChoices?: string[]; spells: Known[]; }
interface CastInfo { spell: string; castAt: number; upcast: boolean; saveDC: number | null; attackBonus: number | null; concentration: boolean; concentrationBroken?: string; summary?: string; mech: Mech; }

const SAVE_LABEL: Record<string, string> = { str: "Fuerza", dex: "Destreza", con: "Constitución", int: "Inteligencia", wis: "Sabiduría", cha: "Carisma" };
const fmt = (n: number | null) => (n == null ? "" : n >= 0 ? `+${n}` : `${n}`);

export function SpellsPanel({ id, sheet, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [view, setView] = useState<SpellView | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ContentHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [castInfo, setCastInfo] = useState<CastInfo | null>(null);
  const [onlyMyClass, setOnlyMyClass] = useState(true);
  const myClasses = sheet.classList?.map((cl) => cl.name) ?? [];

  async function refresh() { setView((await api.getSpells(id)) as unknown as SpellView); }
  useEffect(() => { void refresh(); }, [id]);

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await refresh(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function cast(name: string, level?: number) {
    setBusy(true); setNote(null); setCastInfo(null);
    try {
      const r = (await api.castSpell(id, { spell: name, level })) as Record<string, unknown>;
      await refresh(); await reload();
      setCastInfo({
        spell: String(r["spell"]), castAt: Number(r["castAt"]), upcast: Boolean(r["upcast"]),
        saveDC: (r["saveDC"] as number) ?? null, attackBonus: (r["attackBonus"] as number) ?? null,
        concentration: Boolean(r["concentration"]), concentrationBroken: r["concentrationBroken"] as string | undefined,
        summary: r["summary"] as string | undefined, mech: (r["mechanics"] ?? {}) as Mech,
      });
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function rollDamage(m: Mech) {
    if (!m.damage) return;
    try {
      const res = await api.roll(m.damage);
      const roll = res.rolls[0];
      presentRoll({
        label: `${m.kind === "heal" ? "Curación" : "Daño"}${m.damageType ? ` de ${m.damageType}` : ""} · ${m.damage}`,
        total: roll.total, breakdown: roll.breakdown, detail: m.damageType, dice3d: roll.dice3d ?? [],
        faces: Number(m.damage.split("d")[1]) || 6, profile: "heavy",
      });
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
  }

  async function search(only = onlyMyClass) {
    if (query.trim().length < 2) return;
    // Por defecto, solo conjuros de la(s) clase(s) del personaje; el check permite ver todas (excepciones).
    if (only && myClasses.length) {
      const lists = await Promise.all(myClasses.map((cls) => api.spells({ query, spellClass: cls })));
      const seen = new Set<string>();
      const merged: ContentHit[] = [];
      for (const list of lists) for (const h of list) if (!seen.has(h.id)) { seen.add(h.id); merged.push(h); }
      setFound(merged);
    } else {
      setFound(await api.spells({ query }));
    }
  }

  if (!view) return <p className="muted">Cargando conjuros…</p>;
  const known = [...view.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}
      {view.grantedChoices?.map((n, i) => <p key={i} className="note warn">✨ {n}</p>)}

      {castInfo && (
        <section className="panel cast-result">
          <button className="icon-btn cast-close" onClick={() => setCastInfo(null)} title="Cerrar">✕</button>
          <div className="cast-title">✨ Lanzas {castInfo.spell}{castInfo.upcast ? ` a nivel ${castInfo.castAt}` : ""}</div>
          <div className="cast-meta">
            {castInfo.mech.save && <span className="chip">🛡️ Salvación de {SAVE_LABEL[castInfo.mech.save] ?? castInfo.mech.save} · CD {castInfo.saveDC}</span>}
            {castInfo.mech.attack && <span className="chip">🎯 Ataque de conjuro {fmt(castInfo.attackBonus)}</span>}
            {!castInfo.mech.save && !castInfo.mech.attack && castInfo.saveDC != null && <span className="chip">CD {castInfo.saveDC}</span>}
            {castInfo.concentration && <span className="chip">🌀 Concentración</span>}
            {castInfo.concentrationBroken && <span className="chip danger">rompe «{castInfo.concentrationBroken}»</span>}
          </div>
          {castInfo.mech.shape && <AreaGlyph shape={castInfo.mech.shape} size={castInfo.mech.areaSize} range={castInfo.mech.range} />}
          {castInfo.mech.damage && (
            <button className="btn primary dmg-btn" onClick={() => rollDamage(castInfo.mech)}>
              🎲 Tirar {castInfo.mech.kind === "heal" ? "curación" : "daño"} {castInfo.mech.damage}{castInfo.mech.damageType ? ` (${castInfo.mech.damageType})` : ""}
            </button>
          )}
          {castInfo.summary && <p className="spell-desc">{castInfo.summary}</p>}
        </section>
      )}

      <section className="panel">
        <h2>Slots {sheet.spellcasting && <span className="muted small">· CD {sheet.spellcasting.dc} · ataque {sheet.spellcasting.attack >= 0 ? "+" : ""}{sheet.spellcasting.attack}</span>}</h2>
        <div className="slots">
          {Object.entries(view.slots).map(([lvl, slot]) => (
            <div key={lvl} className="slot-row">
              <span>Nivel {lvl}</span>
              <span className="pips">{Array.from({ length: slot.max }).map((_, i) => <i key={i} className={i < slot.max - slot.used ? "pip full" : "pip"} />)}</span>
              <span className="muted small">{slot.max - slot.used}/{slot.max}</span>
            </div>
          ))}
          {view.pactSlots && <div className="slot-row"><span>Pacto (nv {view.pactSlots.level})</span><span className="muted small">{view.pactSlots.max - view.pactSlots.used}/{view.pactSlots.max}</span></div>}
          {Object.keys(view.slots).length === 0 && !view.pactSlots && <span className="muted small">Sin slots.</span>}
        </div>
        <button className="btn small" disabled={busy} onClick={() => run(() => api.slots(id, { action: "recover_all" }), "Slots restaurados")}>Restaurar todos</button>
      </section>

      <section className="panel">
        <h2>Aprender conjuro</h2>
        <div className="row">
          <input placeholder="Buscar hechizo (≥2 letras)…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <button className="btn" onClick={() => search()}>Buscar</button>
        </div>
        {myClasses.length > 0 && (
          <label className="inline small">
            <input type="checkbox" checked={onlyMyClass} onChange={(e) => { const v = e.target.checked; setOnlyMyClass(v); if (query.trim().length >= 2) void search(v); }} />
            {" "}Solo conjuros de mi clase ({myClasses.join("/")}) · desmarca para excepciones (dotes, Secretos Mágicos…)
          </label>
        )}
        {found.length > 0 && (
          <ul className="spell-list">
            {found.slice(0, 14).map((f) => (
              <li key={f.id} className="spell-row">
                <div className="spell-head">
                  <b>{f.name}</b>
                  {f.preview && <p className="spell-desc">{f.preview}</p>}
                </div>
                <button className="btn small" disabled={busy} onClick={() => run(async () => { await api.learnSpell(id, { spell: f.name }); setFound([]); setQuery(""); }, `Aprendido: ${f.name}`)}>+ Aprender</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SpellBrowser
        myClasses={myClasses}
        known={new Set(view.spells.map((s) => s.name.toLowerCase()))}
        busy={busy}
        onLearn={(name) => run(() => api.learnSpell(id, { spell: name }), `Aprendido: ${name}`)}
      />

      <section className="panel">
        <h2>Conocidos {view.concentratingOn && <span className="chip">🌀 {view.concentratingOn}</span>}</h2>
        {known.length === 0 && <p className="muted small">Ninguno aún. Búscalo arriba para aprenderlo.</p>}
        <ul className="spell-list">
          {known.map((sp) => (
            <li key={sp.name} className="spell-row">
              <div className="spell-head" onClick={() => sp.summary && setOpen(open === sp.name ? null : sp.name)} style={{ cursor: sp.summary ? "pointer" : "default" }}>
                <b>{sp.name} {sp.summary && <span className="muted">{open === sp.name ? "▲" : "▼"}</span>}</b>
                <span className="muted small">{sp.level === 0 ? "Truco" : `Nv ${sp.level}`}{sp.concentration ? " · 🌀 concentración" : ""}{sp.prepared ? " · preparado" : ""}{sp.source?.startsWith("Otorgado:") ? ` · ✨ ${sp.source.replace("Otorgado: ", "de ")}` : ""}</span>
                {(sp.mechanics?.save || sp.mechanics?.attack || sp.mechanics?.damage || sp.mechanics?.area) && (
                  <div className="spell-mech">
                    {sp.mechanics.save && <span>🛡️ {SAVE_LABEL[sp.mechanics.save] ?? sp.mechanics.save}</span>}
                    {sp.mechanics.attack && <span>🎯 ataque</span>}
                    {sp.mechanics.damage && <span>{sp.mechanics.kind === "heal" ? "❤️" : "💥"} {sp.mechanics.baseDamage}{sp.mechanics.damageType ? ` ${sp.mechanics.damageType}` : ""}</span>}
                    {sp.mechanics.area && <span>🔵 {sp.mechanics.area}</span>}
                  </div>
                )}
                {open === sp.name && sp.summary && <p className="spell-desc">{sp.summary}</p>}
              </div>
              <div className="spell-actions">
                {sp.level > 0 && !sp.alwaysPrepared && (
                  <button className="btn small" disabled={busy} onClick={() => run(() => api.prepareSpell(id, sp.name, !sp.prepared))}>{sp.prepared ? "Despreparar" : "Preparar"}</button>
                )}
                <CastControl level={sp.level} disabled={busy} onCast={(lvl) => cast(sp.name, lvl)} />
                <button className="icon-btn" title="Olvidar" disabled={busy} onClick={() => run(() => api.forgetSpell(id, sp.name))}>🗑</button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CastControl({ level, disabled, onCast }: { level: number; disabled: boolean; onCast: (lvl?: number) => void }) {
  const [lvl, setLvl] = useState(level);
  if (level === 0) return <button className="btn small primary" disabled={disabled} onClick={() => onCast()}>Lanzar</button>;
  return (
    <span className="cast-ctl">
      <select value={lvl} onChange={(e) => setLvl(Number(e.target.value))} title="Nivel del slot (upcast)">
        {Array.from({ length: 10 - level }).map((_, i) => <option key={i} value={level + i}>nv {level + i}</option>)}
      </select>
      <button className="btn small primary" disabled={disabled} onClick={() => onCast(lvl)}>Lanzar</button>
    </span>
  );
}
