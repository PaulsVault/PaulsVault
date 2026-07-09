import { useEffect, useState } from "react";
import { api } from "../api";
import type { Sheet } from "../types";

export function CombatPanel({ id, sheet, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [amount, setAmount] = useState(1);
  const [conditionList, setConditionList] = useState<string[]>([]);
  const [condition, setCondition] = useState("");
  const [effName, setEffName] = useState("");
  const [effRounds, setEffRounds] = useState<number | "">("");
  const [effConc, setEffConc] = useState(false);
  const [hitDice, setHitDice] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void api.content("condition").then((cs) => { setConditionList(cs.map((c) => c.name)); setCondition(cs[0]?.name ?? ""); });
  }, []);

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}

      <section className="panel">
        <h2>Puntos de golpe</h2>
        <div className="row">
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ maxWidth: 90 }} />
          <button className="btn" disabled={busy} onClick={() => run(() => api.hp(id, { action: "damage", amount }))}>− Daño</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.hp(id, { action: "heal", amount }))}>+ Curar</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.hp(id, { action: "set_temp", amount }))}>PG temp</button>
        </div>
        <div className="row wrap">
          <span className="muted small">Salvaciones de muerte: éxitos {sheet.hp.current === 0 ? "" : ""}</span>
          <button className="btn small" disabled={busy} onClick={() => run(() => api.hp(id, { action: "death_save", deathSaveResult: "success" }))}>✓ Éxito</button>
          <button className="btn small" disabled={busy} onClick={() => run(() => api.hp(id, { action: "death_save", deathSaveResult: "failure" }))}>✗ Fallo</button>
          <button className="btn small" disabled={busy} onClick={() => run(() => api.hp(id, { action: "death_save", deathSaveResult: "critical" }), "¡Revive con 1 PG!")}>20 nat.</button>
          <button className="btn small" disabled={busy} onClick={() => run(() => api.hp(id, { action: "stabilize" }))}>Estabilizar</button>
        </div>
      </section>

      <section className="panel">
        <h2>Condiciones</h2>
        <div className="row">
          <select value={condition} onChange={(e) => setCondition(e.target.value)}>
            {conditionList.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button className="btn" disabled={busy || !condition} onClick={() => run(() => api.conditions(id, { action: "apply", condition }))}>Aplicar</button>
        </div>
        <div className="chips">
          {sheet.conditions.length === 0 && <span className="muted small">Ninguna</span>}
          {sheet.conditions.map((c) => (
            <button key={c.name} className="chip removable" disabled={busy}
              onClick={() => run(() => api.conditions(id, { action: "remove", condition: c.name }))}>
              {c.name}{c.level ? ` ${c.level}` : ""} ✕
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Efectos</h2>
        <div className="row wrap">
          <input placeholder="Nombre del efecto" value={effName} onChange={(e) => setEffName(e.target.value)} style={{ minWidth: 140 }} />
          <input type="number" min={1} placeholder="rondas" value={effRounds} onChange={(e) => setEffRounds(e.target.value === "" ? "" : Number(e.target.value))} style={{ maxWidth: 90 }} />
          <label className="inline"><input type="checkbox" checked={effConc} onChange={(e) => setEffConc(e.target.checked)} /> concentración</label>
          <button className="btn" disabled={busy || !effName} onClick={() => run(async () => { await api.effects(id, { action: "add", name: effName, rounds: effRounds || undefined, concentration: effConc }); setEffName(""); setEffRounds(""); setEffConc(false); })}>Añadir</button>
        </div>
        <div className="chips">
          {sheet.effects.length === 0 && <span className="muted small">Ninguno</span>}
          {sheet.effects.map((e) => (
            <button key={e.id} className="chip removable" disabled={busy} onClick={() => run(() => api.effects(id, { action: "remove", name: e.name }))}>
              {e.concentration ? "🌀 " : ""}{e.name}{e.roundsRemaining != null ? ` (${e.roundsRemaining})` : ""} ✕
            </button>
          ))}
        </div>
        {sheet.effects.some((e) => e.roundsRemaining != null) && (
          <button className="btn small" disabled={busy} onClick={() => run(() => api.effects(id, { action: "tick", rounds: 1 }), "Ronda avanzada")}>⏱ Avanzar 1 ronda</button>
        )}
      </section>

      <section className="panel">
        <h2>Descanso</h2>
        <div className="row wrap">
          <label className="inline">Dados de golpe: <input type="number" min={0} value={hitDice} onChange={(e) => setHitDice(Number(e.target.value))} style={{ maxWidth: 70 }} /></label>
          <button className="btn" disabled={busy} onClick={() => run(() => api.rest(id, { type: "short", hitDiceToSpend: hitDice }), "Descanso corto")}>Descanso corto</button>
          <button className="btn" disabled={busy} onClick={() => run(() => api.rest(id, { type: "long" }), "Descanso largo")}>Descanso largo</button>
        </div>
      </section>
    </div>
  );
}
