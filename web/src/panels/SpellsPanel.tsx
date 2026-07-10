import { useEffect, useState } from "react";
import { api } from "../api";
import type { ContentHit, Sheet } from "../types";

interface Known { name: string; level: number; prepared: boolean; alwaysPrepared?: boolean; concentration?: boolean; source: string; summary?: string; }
interface SpellView { saveDC: number | null; attackBonus: number | null; slots: Record<string, { max: number; used: number }>; pactSlots?: { level: number; max: number; used: number } | null; concentratingOn?: string | null; spells: Known[]; }

export function SpellsPanel({ id, sheet, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [view, setView] = useState<SpellView | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ContentHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function refresh() { setView((await api.getSpells(id)) as unknown as SpellView); }
  useEffect(() => { void refresh(); }, [id]);

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await refresh(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function cast(name: string, level?: number) {
    setBusy(true); setNote(null);
    try {
      const r = (await api.castSpell(id, { spell: name, level })) as Record<string, unknown>;
      await refresh(); await reload();
      const parts = [`✨ Lanzas ${r["spell"]}${r["upcast"] ? ` a nivel ${r["castAt"]}` : ""}.`];
      if (r["saveDC"] != null) parts.push(`CD de salvación ${r["saveDC"]}.`);
      if (r["concentration"]) parts.push("🌀 Concentración activa.");
      if (r["concentrationBroken"]) parts.push(`Rompe la concentración en «${r["concentrationBroken"]}».`);
      if (r["summary"]) parts.push(`— ${r["summary"]}`);
      setNote(parts.join(" "));
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function search() {
    if (query.trim().length < 2) return;
    setFound(await api.spells({ query }));
  }

  if (!view) return <p className="muted">Cargando conjuros…</p>;
  const known = [...view.spells].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}

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
          <button className="btn" onClick={search}>Buscar</button>
        </div>
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

      <section className="panel">
        <h2>Conocidos {view.concentratingOn && <span className="chip">🌀 {view.concentratingOn}</span>}</h2>
        {known.length === 0 && <p className="muted small">Ninguno aún. Búscalo arriba para aprenderlo.</p>}
        <ul className="spell-list">
          {known.map((sp) => (
            <li key={sp.name} className="spell-row">
              <div className="spell-head" onClick={() => sp.summary && setOpen(open === sp.name ? null : sp.name)} style={{ cursor: sp.summary ? "pointer" : "default" }}>
                <b>{sp.name} {sp.summary && <span className="muted">{open === sp.name ? "▲" : "▼"}</span>}</b>
                <span className="muted small">{sp.level === 0 ? "Truco" : `Nv ${sp.level}`}{sp.concentration ? " · 🌀 concentración" : ""}{sp.prepared ? " · preparado" : ""}</span>
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
