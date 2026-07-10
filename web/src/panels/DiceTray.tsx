import { useState } from "react";
import { api } from "../api";
import { ABILITIES, ABILITY_LABEL } from "../types";

interface Entry { text: string; total?: number; crit?: string | null; }

const QUICK = ["1d20", "1d4", "1d6", "1d8", "1d10", "1d12", "2d6", "4d6kh3", "1d100"];

export function DiceTray({ id, inspiration, reload }: { id: string; inspiration: boolean; reload: () => Promise<void> }) {
  const [expr, setExpr] = useState("1d20");
  const [adv, setAdv] = useState("normal");
  const [log, setLog] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  async function toggleInspiration(value: boolean) {
    setBusy(true);
    try { await api.updateCharacter(id, { inspiration: value }); await reload(); }
    finally { setBusy(false); }
  }

  function push(e: Entry) { setLog((l) => [e, ...l].slice(0, 30)); }

  async function roll(expression: string) {
    setBusy(true);
    try {
      const r = await api.roll(expression, adv);
      const first = r.rolls[0];
      push({ text: `${expression}${adv !== "normal" ? ` (${adv === "advantage" ? "ventaja" : "desventaja"})` : ""}: ${first.breakdown}`, total: first.total, crit: first.crit });
    } catch (e) { push({ text: "⚠️ " + (e as Error).message }); }
    finally { setBusy(false); }
  }

  async function check(type: string, target?: string) {
    setBusy(true);
    try {
      const r = await api.check(id, { type, target, advantage: adv }) as { breakdown?: string; roll?: number; total?: number; crit?: string | null; modifierDetail?: string };
      const label = `${type}${target ? ` (${target})` : ""}`;
      push({ text: `${label}: ${r.breakdown ?? ""}`, total: r.roll ?? r.total, crit: r.crit });
    } catch (e) { push({ text: "⚠️ " + (e as Error).message }); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <section className={`panel${inspiration ? " inspire-on" : ""}`}>
        <h2>✨ Inspiración heroica</h2>
        <label className="inline">
          <input type="checkbox" checked={inspiration} disabled={busy} onChange={(e) => toggleInspiration(e.target.checked)} />
          {inspiration
            ? " La tienes: puedes repetir una tirada de d20. Desmárcala cuando la gastes."
            : " No la tienes ahora. Márcala si tu DM te la concede."}
        </label>
      </section>

      <section className="panel">
        <h2>Tirar dados</h2>
        <div className="row">
          <input value={expr} onChange={(e) => setExpr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && roll(expr)} placeholder="p.ej. 2d6+3, 4d6kh3" />
          <select value={adv} onChange={(e) => setAdv(e.target.value)}>
            <option value="normal">Normal</option>
            <option value="advantage">Ventaja</option>
            <option value="disadvantage">Desventaja</option>
          </select>
          <button className="btn primary" disabled={busy} onClick={() => roll(expr)}>Tirar</button>
        </div>
        <div className="chips">{QUICK.map((q) => <button key={q} className="chip" disabled={busy} onClick={() => roll(q)}>{q}</button>)}</div>
      </section>

      <section className="panel">
        <h2>Pruebas del personaje</h2>
        <div className="chips">
          <button className="chip" disabled={busy} onClick={() => check("initiative")}>Iniciativa</button>
          {ABILITIES.map((a) => <button key={"s" + a} className="chip" disabled={busy} onClick={() => check("save", a)}>Salv. {ABILITY_LABEL[a]}</button>)}
        </div>
        <div className="chips">
          {["perception", "stealth", "athletics", "arcana", "persuasion", "insight"].map((sk) => (
            <button key={sk} className="chip" disabled={busy} onClick={() => check("skill", sk)}>{sk}</button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Historial</h2>
        {log.length === 0 && <p className="muted small">Sin tiradas todavía.</p>}
        <ul className="roll-log">
          {log.map((e, i) => (
            <li key={i} className={e.crit === "critical" ? "crit" : e.crit === "fumble" ? "fumble" : ""}>
              <span className="roll-text">{e.text}</span>
              {e.total != null && <b className="roll-total">{e.total}</b>}
              {e.crit === "critical" && <span className="tag good">¡CRÍTICO!</span>}
              {e.crit === "fumble" && <span className="tag bad">pifia</span>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
