import { useEffect, useState } from "react";
import { api, type MonsterData } from "../api";
import { presentRoll } from "../rollPresenter";
import { MonsterStatBlock } from "../dm/MonsterStatBlock";
import type { RollProfile } from "../dm/DMView";
import type { BeastForm, Sheet } from "../types";

// Tira usando el presentador de dados compartido (igual que el bestiario del DM).
async function beastRoll(label: string, expr: string, profile: RollProfile) {
  try {
    const res = await api.roll(expr);
    const r0 = res.rolls[0];
    presentRoll({ label, total: r0.total, breakdown: r0.breakdown, crit: r0.crit as "critical" | "fumble" | null, dice3d: r0.dice3d ?? [], profile });
  } catch { /* noop */ }
}

export function WildShapePanel({ id, sheet: s, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const ws = s.wildShape;
  const [beasts, setBeasts] = useState<BeastForm[]>([]);
  const [selected, setSelected] = useState<{ name: string; data: MonsterData } | null>(null);
  const [loadingBeast, setLoadingBeast] = useState(false);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => { if (ws) void api.wildShapeBeasts(id).then(setBeasts).catch(() => setBeasts([])); }, [id, ws?.maxCRNum, ws?.fly]);

  if (!ws) return <p className="muted">Solo el Druida (nivel 2+) obtiene Forma Salvaje.</p>;
  const left = ws.maxUses - ws.used;

  async function use(delta: number) {
    setBusy(true);
    try { await api.wildShape(id, delta); await reload(); }
    finally { setBusy(false); }
  }
  async function showBeast(name: string) {
    setLoadingBeast(true);
    try { setSelected({ name, data: await api.monster(name) }); }
    catch { setSelected(null); }
    finally { setLoadingBeast(false); }
  }

  const filtered = beasts.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="stack">
      <section className="panel">
        <h2>🐻 Forma Salvaje</h2>
        <div className="info-grid">
          <div><span className="muted small">Usos</span><b>{"●".repeat(left)}{"○".repeat(ws.used)} {left}/{ws.maxUses}</b></div>
          <div><span className="muted small">CR máximo</span><b>{ws.maxCRLabel}</b></div>
          <div><span className="muted small">Vuelo</span><b>{ws.fly ? "Sí (nivel 8+)" : "No (desde nivel 8)"}</b></div>
          <div><span className="muted small">Formas conocidas</span><b>{ws.knownForms}</b></div>
          <div><span className="muted small">Duración</span><b>{ws.hours} h</b></div>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn small primary" disabled={busy || left <= 0} onClick={() => use(1)}>− Usar una forma</button>
          <button className="btn small" disabled={busy || ws.used <= 0} onClick={() => use(-1)}>＋ Restaurar uso</button>
        </div>
        <p className="muted small" style={{ marginTop: 6 }}>Recuperas un uso en un descanso corto y todos en uno largo. Nado permitido; vuelo desde nivel 8.</p>
      </section>

      <section className="panel">
        <h2>Bestias disponibles <span className="muted small">({filtered.length})</span></h2>
        <input placeholder="Buscar bestia…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="beast-list" style={{ maxHeight: 320, overflowY: "auto", marginTop: 8 }}>
          {filtered.map((b) => (
            <button type="button" key={b.name} className={`beast-row${selected?.name === b.name ? " active" : ""}`} onClick={() => showBeast(b.name)}
              style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8, padding: "6px 8px", textAlign: "left" }}>
              <b>{b.name}</b>
              <span className="muted small">CR {b.cr} · {b.size} · CA {b.ac} · PG {b.hp}{b.swim ? " · 🏊" : ""}{b.fly ? " · 🦅" : ""}</span>
            </button>
          ))}
          {beasts.length === 0 && <p className="muted small">No hay bestias cargadas. Re-sincroniza el contenido (bestiario 2024).</p>}
        </div>
      </section>

      {(loadingBeast || selected) && (
        <section className="panel">
          {loadingBeast ? <p className="muted">Cargando stat block…</p> : selected && <MonsterStatBlock name={selected.name} data={selected.data} roll={beastRoll} />}
        </section>
      )}
    </div>
  );
}
