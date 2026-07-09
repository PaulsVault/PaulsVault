import { useEffect, useState } from "react";
import { api } from "../api";

interface Companion { id: string; name: string; kind: string; species?: string; hp: { max: number; current: number; temp: number }; ac?: number; speed?: string; conditions: string[]; }

const KINDS = ["companion", "pet", "familiar", "mount", "summon", "sidekick"];

export function CompanionsPanel({ id }: { id: string }) {
  const [list, setList] = useState<Companion[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("companion");
  const [hpMax, setHpMax] = useState(10);
  const [ac, setAc] = useState(12);
  const [note, setNote] = useState<string | null>(null);

  async function refresh() { setList(((await api.getCompanions(id)).companions ?? []) as unknown as Companion[]); }
  useEffect(() => { void refresh(); }, [id]);

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await refresh(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}

      <section className="panel">
        <h2>Nuevo compañero</h2>
        <div className="row wrap">
          <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 130 }} />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          <label className="inline">PG <input type="number" min={1} value={hpMax} onChange={(e) => setHpMax(Number(e.target.value))} style={{ maxWidth: 70 }} /></label>
          <label className="inline">CA <input type="number" value={ac} onChange={(e) => setAc(Number(e.target.value))} style={{ maxWidth: 70 }} /></label>
          <button className="btn primary" disabled={busy || !name} onClick={() => run(async () => { await api.createCompanion(id, { name, kind, hpMax, ac }); setName(""); }, "Compañero creado")}>Crear</button>
        </div>
      </section>

      {list.length === 0 && <p className="muted">Sin compañeros.</p>}
      <div className="card-grid">
        {list.map((k) => (
          <article key={k.id} className="panel companion-card">
            <div className="library-head" style={{ marginBottom: 8 }}>
              <div><b>{k.name}</b> <span className="muted small">{k.kind}{k.species ? ` · ${k.species}` : ""}</span></div>
              <button className="icon-btn" disabled={busy} title="Eliminar" onClick={() => run(() => api.deleteCompanion(id, k.id))}>🗑</button>
            </div>
            <p className="muted small">PG {k.hp.current}/{k.hp.max}{k.ac != null ? ` · CA ${k.ac}` : ""}{k.speed ? ` · ${k.speed}` : ""}</p>
            {k.conditions.length > 0 && <div className="chips">{k.conditions.map((c) => <span key={c} className="chip">{c}</span>)}</div>}
            <div className="row">
              <button className="btn small" disabled={busy} onClick={() => run(() => api.companionHp(id, k.id, "damage", 1))}>− PG</button>
              <button className="btn small" disabled={busy} onClick={() => run(() => api.companionHp(id, k.id, "heal", 1))}>+ PG</button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
