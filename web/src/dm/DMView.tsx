import { useEffect, useMemo, useState } from "react";
import { api, type MonsterCard, type MonsterData } from "../api";
import { DiceOverlay } from "../DiceOverlay";
import { presentRoll } from "../rollPresenter";
import { MonsterStatBlock } from "./MonsterStatBlock";

const crn = (cr: string) => (cr === "1/8" ? 0.125 : cr === "1/4" ? 0.25 : cr === "1/2" ? 0.5 : Number(cr) || 0);
export type RollProfile = "fast" | "normal" | "heavy";

export function DMView() {
  const [monsters, setMonsters] = useState<MonsterCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [crFilter, setCrFilter] = useState("all");
  const [selected, setSelected] = useState<{ name: string; data: MonsterData } | null>(null);
  const [loadingMon, setLoadingMon] = useState(false);

  useEffect(() => { api.monsters().then(setMonsters).catch(() => setMonsters([])).finally(() => setLoading(false)); }, []);

  const crValues = useMemo(() => [...new Set(monsters.map((m) => m.cr))].sort((a, b) => crn(a) - crn(b)), [monsters]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monsters
      .filter((m) => (crFilter === "all" || m.cr === crFilter) && (!q || m.name.toLowerCase().includes(q) || m.type.toLowerCase().includes(q)))
      .slice(0, 250);
  }, [monsters, query, crFilter]);

  async function open(name: string) {
    setLoadingMon(true);
    try { setSelected({ name, data: await api.monster(name) }); } catch { setSelected(null); } finally { setLoadingMon(false); }
  }

  async function roll(label: string, expr: string, profile: RollProfile) {
    try {
      const res = await api.roll(expr);
      const r0 = res.rolls[0];
      presentRoll({ label, total: r0.total, breakdown: r0.breakdown, crit: r0.crit as "critical" | "fumble" | null, dice3d: r0.dice3d ?? [], profile });
    } catch { /* noop */ }
  }

  return (
    <div className="dm-view">
      <DiceOverlay themeColor="#c0392b" />
      <div className="library-head"><h1>⚔️ Mesa del DM</h1></div>
      <p className="muted small">Bestiario del Manual de Monstruos 2024: stat blocks con tiradas de ataque, daño y salvación. El tracker de iniciativa y encuentros llega en la siguiente fase.</p>

      <div className="dm-bestiary">
        <div className="panel dm-list">
          <div className="row wrap">
            <input placeholder="Buscar monstruo…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <select value={crFilter} onChange={(e) => setCrFilter(e.target.value)}>
              <option value="all">Todos los CR</option>
              {crValues.map((cr) => <option key={cr} value={cr}>CR {cr}</option>)}
            </select>
          </div>
          {loading ? <p className="muted small">Cargando bestiario…</p> : (
            <ul className="line-list dm-mon-list">
              {shown.map((m) => (
                <li key={m.name} className={`clickable${selected?.name === m.name ? " active" : ""}`} onClick={() => open(m.name)}>
                  <span><b>{m.name}</b><span className="muted small"> · CR {m.cr} · {m.type}</span></span>
                  <span className="muted small">CA {m.ac} · PG {m.hp}</span>
                </li>
              ))}
              {shown.length === 0 && <li className="muted small">Sin resultados.</li>}
            </ul>
          )}
          <p className="muted small">{monsters.length} monstruos{shown.length >= 250 ? " · mostrando 250, afina la búsqueda" : ""}</p>
        </div>
        <div className="dm-detail">
          {loadingMon ? <p className="muted">Cargando…</p> : selected ? <MonsterStatBlock name={selected.name} data={selected.data} roll={roll} /> : <p className="muted">Elige un monstruo de la lista para ver su stat block y usar sus acciones.</p>}
        </div>
      </div>
    </div>
  );
}
