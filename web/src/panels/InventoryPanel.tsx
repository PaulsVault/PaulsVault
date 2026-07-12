import { useEffect, useState } from "react";
import { api } from "../api";
import { AreaGlyph } from "../AreaGlyph";
import { presentRoll } from "../rollPresenter";
import type { ContentHit } from "../types";

interface Mech { kind?: string; save?: string; attack?: boolean; damage?: string; damageType?: string; range?: string; shape?: string; areaSize?: number; area?: string; }
interface Charges { current: number; max: number; recharge?: string; rechargeAmount?: string }
interface InvItem { id: string; name: string; type: string; qty: number; equipped: boolean; attuned: boolean; damage?: string; inside?: string; description?: string; requiresAttunement?: boolean; charges?: Charges; spells?: { cost: number; name: string }[]; activatable?: boolean; proficient?: boolean; }
interface InvView { inventory: InvItem[]; encumbrance: { carried: number; capacity: number }; ac: number; currency: Record<string, number>; equipmentWarning?: string | null; }
interface ItemCast { item: string; spell: string; cost: number; chargesLeft: number; saveDC: number | null; attackBonus: number | null; summary?: string; mech: Mech; note?: string; }

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;
const SAVE_LABEL: Record<string, string> = { str: "Fuerza", dex: "Destreza", con: "Constitución", int: "Inteligencia", wis: "Sabiduría", cha: "Carisma" };
const fmt = (n: number | null) => (n == null ? "" : n >= 0 ? `+${n}` : `${n}`);

export function InventoryPanel({ id, reload }: { id: string; reload: () => Promise<void> }) {
  const [view, setView] = useState<InvView | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ContentHit[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [castInfo, setCastInfo] = useState<ItemCast | null>(null);

  async function refresh() { setView((await api.getInventory(id)) as unknown as InvView); }
  useEffect(() => { void refresh(); }, [id]);

  async function castItem(itemId: string, spell: string) {
    setBusy(true); setNote(null);
    try {
      const r = (await api.castFromItem(id, itemId, spell)) as Record<string, unknown>;
      await refresh(); await reload();
      setCastInfo({
        item: String(r["item"]), spell: String(r["spell"]), cost: Number(r["cost"]), chargesLeft: Number(r["chargesLeft"]),
        saveDC: (r["saveDC"] as number) ?? null, attackBonus: (r["attackBonus"] as number) ?? null,
        summary: r["summary"] as string | undefined, mech: (r["mechanics"] ?? {}) as Mech,
      });
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function useItemEffect(itemId: string) {
    setBusy(true); setNote(null);
    try {
      const r = (await api.useItem(id, itemId)) as Record<string, unknown>;
      await refresh(); await reload();
      setCastInfo({
        item: String(r["item"]), spell: "Efecto", cost: 0, chargesLeft: -1,
        saveDC: (r["saveDC"] as number) ?? null, attackBonus: null,
        summary: r["summary"] as string | undefined, mech: (r["mechanics"] ?? {}) as Mech,
        note: r["note"] as string | undefined,
      });
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function rollDamage(m: Mech) {
    if (!m.damage) return;
    try {
      const res = await api.roll(m.damage);
      const roll = res.rolls[0];
      presentRoll({ label: `${m.kind === "heal" ? "Curación" : "Daño"}${m.damageType ? ` de ${m.damageType}` : ""} · ${m.damage}`, total: roll.total, breakdown: roll.breakdown, detail: m.damageType, dice3d: roll.dice3d ?? [], faces: Number(m.damage.split("d")[1]) || 6, profile: "heavy" });
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
  }

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await refresh(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function search() {
    if (query.trim().length < 2) return;
    setFound(await api.content("item", query));
  }

  if (!view) return <p className="muted">Cargando inventario…</p>;
  const enc = view.encumbrance;
  const pct = Math.min(100, Math.round((enc.carried / Math.max(1, enc.capacity)) * 100));

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}
      {view.equipmentWarning && <p className="note warn">⚠️ {view.equipmentWarning}</p>}

      {castInfo && (
        <section className="panel cast-result">
          <button className="icon-btn cast-close" onClick={() => setCastInfo(null)} title="Cerrar">✕</button>
          <div className="cast-title">
            ✨ {castInfo.item}{castInfo.spell !== "Efecto" ? `: ${castInfo.spell}` : ""}
            {castInfo.cost > 0 && <span className="muted small"> · {castInfo.cost} carga{castInfo.cost !== 1 ? "s" : ""} (quedan {castInfo.chargesLeft})</span>}
          </div>
          {castInfo.note && <p className="note">{castInfo.note}</p>}
          <div className="cast-meta">
            {castInfo.mech.save && <span className="chip">🛡️ Salvación de {SAVE_LABEL[castInfo.mech.save] ?? castInfo.mech.save} · CD {castInfo.saveDC}</span>}
            {castInfo.mech.attack && <span className="chip">🎯 Ataque de conjuro {fmt(castInfo.attackBonus)}</span>}
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
        <h2>Carga</h2>
        <div className="bar"><div className="bar-fill" style={{ width: pct + "%", background: pct > 100 ? "var(--danger)" : "var(--accent)" }} /></div>
        <p className="muted small">{enc.carried} / {enc.capacity} lb · CA actual {view.ac}</p>
      </section>

      <section className="panel">
        <h2>Añadir objeto</h2>
        <div className="row">
          <input placeholder="Buscar objeto (≥2 letras)…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
          <button className="btn" onClick={search}>Buscar</button>
        </div>
        {found.length > 0 && (
          <ul className="line-list">
            {found.slice(0, 12).map((f) => (
              <li key={f.id}>
                <span>{f.name}</span>
                <button className="btn small" disabled={busy} onClick={() => run(async () => { await api.addItem(id, { item: f.name }); setFound([]); setQuery(""); }, `Añadido: ${f.name}`)}>+ Añadir</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Inventario</h2>
        {view.inventory.length === 0 && <p className="muted small">Vacío.</p>}
        <ul className="inv-list">
          {view.inventory.map((it) => (
            <li key={it.id} className="inv-row">
              <div className="inv-line">
                <div style={{ minWidth: 0, cursor: it.description ? "pointer" : "default" }}
                  onClick={() => it.description && setOpenItem(openItem === it.id ? null : it.id)}>
                  <b>{it.name}</b>{it.qty > 1 && <span className="muted small"> ×{it.qty}</span>}
                  {it.description && <span className="muted"> {openItem === it.id ? "▲" : "▼"}</span>}
                  <div className="muted small">{it.type}{it.damage ? ` · ${it.damage}` : ""}{it.inside ? ` · en ${it.inside}` : ""}{it.charges ? ` · ${it.charges.current}/${it.charges.max} cargas` : ""}{it.requiresAttunement ? " · requiere sintonía" : ""}{it.equipped ? " · equipado" : ""}{it.attuned ? " · sintonizado" : ""}{it.proficient === false ? <span className="prof-warn"> · ⚠️ sin competencia</span> : ""}</div>
                  {openItem === it.id && it.description && <p className="inv-desc">{it.description}</p>}
                </div>
                <div className="inv-actions">
                  {it.activatable && (
                    <button className="btn small primary" disabled={busy || (it.requiresAttunement && !it.attuned)} onClick={() => useItemEffect(it.id)} title="Usar el efecto del objeto">Usar</button>
                  )}
                  {(it.type === "armor" || it.type === "shield" || it.type === "weapon") && (
                    <button className="btn small" disabled={busy} onClick={() => run(() => api.itemAction(id, it.id, it.equipped ? "unequip" : "equip"))}>{it.equipped ? "Quitar" : "Equipar"}</button>
                  )}
                  <button className="btn small" disabled={busy} onClick={() => run(() => api.itemAction(id, it.id, it.attuned ? "unattune" : "attune"))}>{it.attuned ? "Desintonizar" : "Sintonizar"}</button>
                  <button className="icon-btn" title="Quitar" disabled={busy} onClick={() => run(() => api.removeItem(id, it.id))}>🗑</button>
                </div>
              </div>

              {it.charges && (
                <div className="item-charges">
                  {(!it.requiresAttunement || it.attuned) ? (
                    <>
                      <div className="row wrap" style={{ alignItems: "center" }}>
                        <span className="pips">{Array.from({ length: it.charges.max }).map((_, i) => <i key={i} className={i < it.charges!.current ? "pip full" : "pip"} />)}</span>
                        <span className="muted small">{it.charges.current}/{it.charges.max}{it.charges.recharge ? ` · recarga: ${it.charges.recharge}` : ""}</span>
                        <button className="btn small" disabled={busy || it.charges.current < 1} onClick={() => run(() => api.useCharges(id, it.id, 1))}>Gastar 1</button>
                        <button className="btn small" disabled={busy} onClick={() => run(() => api.restoreCharges(id, it.id))}>Recargar</button>
                      </div>
                      {it.spells && it.spells.length > 0 && (
                        <div className="row wrap item-spells">
                          {it.spells.map((sp) => (
                            <button key={sp.name} className="btn small primary" disabled={busy || it.charges!.current < sp.cost}
                              onClick={() => castItem(it.id, sp.name)} title={`Cuesta ${sp.cost} carga(s)`}>
                              {sp.name} <span className="chip-cost">{sp.cost}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : <span className="muted small">Sintoniza el objeto para usar sus cargas y conjuros.</span>}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>Monedas</h2>
        <div className="coins">
          {COINS.map((c) => (
            <div key={c} className="coin">
              <span className="coin-label">{c.toUpperCase()}</span>
              <span className="coin-val">{view.currency[c] ?? 0}</span>
              <div className="coin-btns">
                <button className="btn small" disabled={busy} onClick={() => run(() => api.currency(id, { [c]: 1 }))}>+</button>
                <button className="btn small" disabled={busy} onClick={() => run(() => api.currency(id, { [c]: -1 }))}>−</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
