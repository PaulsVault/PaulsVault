import { useEffect, useState } from "react";
import { api } from "../api";
import type { ContentHit } from "../types";

interface InvItem { id: string; name: string; type: string; qty: number; equipped: boolean; attuned: boolean; damage?: string; inside?: string; }
interface InvView { inventory: InvItem[]; encumbrance: { carried: number; capacity: number }; ac: number; currency: Record<string, number>; }

const COINS = ["pp", "gp", "ep", "sp", "cp"] as const;

export function InventoryPanel({ id, reload }: { id: string; reload: () => Promise<void> }) {
  const [view, setView] = useState<InvView | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<ContentHit[]>([]);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() { setView((await api.getInventory(id)) as unknown as InvView); }
  useEffect(() => { void refresh(); }, [id]);

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
              <div>
                <b>{it.name}</b>{it.qty > 1 && <span className="muted small"> ×{it.qty}</span>}
                <div className="muted small">{it.type}{it.damage ? ` · ${it.damage}` : ""}{it.inside ? ` · en ${it.inside}` : ""}{it.equipped ? " · equipado" : ""}{it.attuned ? " · sintonizado" : ""}</div>
              </div>
              <div className="inv-actions">
                {(it.type === "armor" || it.type === "shield" || it.type === "weapon") && (
                  <button className="btn small" disabled={busy} onClick={() => run(() => api.itemAction(id, it.id, it.equipped ? "unequip" : "equip"))}>{it.equipped ? "Quitar" : "Equipar"}</button>
                )}
                <button className="btn small" disabled={busy} onClick={() => run(() => api.itemAction(id, it.id, it.attuned ? "unattune" : "attune"))}>{it.attuned ? "Desintonizar" : "Sintonizar"}</button>
                <button className="icon-btn" title="Quitar" disabled={busy} onClick={() => run(() => api.removeItem(id, it.id))}>🗑</button>
              </div>
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
