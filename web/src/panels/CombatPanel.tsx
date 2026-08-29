import { useEffect, useState } from "react";
import { api } from "../api";
import { ABILITIES, ABILITY_LABEL, type ContentHit, type Sheet } from "../types";

// Constructor de efecto personalizado: filas → modificadores (StatModifier) que la hoja aplica.
const DTYPES = ["radiante", "fuego", "frío", "ácido", "veneno", "necrótico", "psíquico", "relámpago", "trueno", "fuerza", "contundente", "cortante", "perforante"];
const EFF_KINDS: { k: string; label: string; num?: boolean; dice?: boolean; abil?: boolean; dtype?: boolean }[] = [
  { k: "ac", label: "Bono a la CA", num: true },
  { k: "damage_add", label: "Bono al daño (dados)", dice: true, dtype: true },
  { k: "resist", label: "Resistencia a daño", dtype: true },
  { k: "immune", label: "Inmunidad a daño", dtype: true },
  { k: "vulnerable", label: "Vulnerabilidad a daño", dtype: true },
  { k: "save_all", label: "Bono a todas las salvaciones", num: true },
  { k: "save_one", label: "Bono a una salvación", num: true, abil: true },
  { k: "check", label: "Bono a pruebas de habilidad", num: true },
  { k: "attack", label: "Bono a ataques", num: true },
  { k: "initiative", label: "Bono a iniciativa", num: true },
  { k: "speed", label: "Bono a velocidad (ft)", num: true },
  { k: "adv_save", label: "Ventaja en salvación", abil: true },
  { k: "dis_save", label: "Desventaja en salvación", abil: true },
  { k: "dis_check", label: "Desventaja en pruebas" },
  { k: "dis_attack", label: "Desventaja en ataques" },
];
type EffRow = { kind: string; value: string; ability: string; dtype: string };
function toMod(r: EffRow): Record<string, unknown> {
  const n = Number(r.value) || 0;
  switch (r.kind) {
    case "ac": return { target: "ac", op: "add", value: n };
    case "damage_add": return { target: "damage", op: "add", value: r.value || "1d6", note: r.dtype };
    case "resist": return { target: "damage", op: "resist", note: r.dtype };
    case "immune": return { target: "damage", op: "immune", note: r.dtype };
    case "vulnerable": return { target: "damage", op: "vulnerable", note: r.dtype };
    case "save_all": return { target: "save", op: "add", value: n };
    case "save_one": return { target: "save", op: "add", value: n, ability: r.ability };
    case "check": return { target: "check", op: "add", value: n };
    case "attack": return { target: "attack", op: "add", value: n };
    case "initiative": return { target: "initiative", op: "add", value: n };
    case "speed": return { target: "speed", op: "add", value: n };
    case "adv_save": return { target: "save", op: "advantage", ability: r.ability };
    case "dis_save": return { target: "save", op: "disadvantage", ability: r.ability };
    case "dis_check": return { target: "check", op: "disadvantage" };
    case "dis_attack": return { target: "attack", op: "disadvantage" };
    default: return { target: "ac", op: "add", value: 0 };
  }
}

export function CombatPanel({ id, sheet, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [amount, setAmount] = useState(1);
  const [conditions, setConditions] = useState<ContentHit[]>([]);
  const [condition, setCondition] = useState("");
  const [effName, setEffName] = useState("");
  const [effRounds, setEffRounds] = useState<number | "">("");
  const [effConc, setEffConc] = useState(false);
  const [hitDice, setHitDice] = useState(1);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // Efecto personalizado con bonos (buff/debuff acumulable)
  const [cxOpen, setCxOpen] = useState(false);
  const [cxName, setCxName] = useState("");
  const [cxRounds, setCxRounds] = useState<number | "">("");
  const [cxRows, setCxRows] = useState<EffRow[]>([{ kind: "ac", value: "2", ability: "con", dtype: "radiante" }]);
  const setCxRow = (i: number, patch: Partial<EffRow>) => setCxRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  useEffect(() => {
    void api.content("condition").then((cs) => { setConditions(cs); setCondition(cs[0]?.name ?? ""); });
  }, []);

  const condDescMap = Object.fromEntries(conditions.map((c) => [c.name, c.preview ?? ""]));
  const selectedDesc = condDescMap[condition];

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function applyCondition() {
    setBusy(true); setNote(null);
    try {
      const r = (await api.conditions(id, { action: "apply", condition })) as Record<string, unknown>;
      await reload();
      setNote(`Aplicada «${condition}».${r["rules"] ? " " + r["rules"] : ""}${r["broke"] ? ` (rompe la concentración en ${r["broke"]})` : ""}`);
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
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
            {conditions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <button className="btn" disabled={busy || !condition} onClick={applyCondition}>Aplicar</button>
        </div>
        {selectedDesc && <p className="cond-desc">{selectedDesc}</p>}
        <div className="chips">
          {sheet.conditions.length === 0 && <span className="muted small">Ninguna</span>}
          {sheet.conditions.map((c) => (
            <button key={c.name} className="chip removable" disabled={busy} title={condDescMap[c.name]}
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

        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn small alt" onClick={() => setCxOpen((v) => !v)}>{cxOpen ? "▲ Ocultar" : "➕ Efecto personalizado (con bonos)"}</button>
          {cxOpen && (
            <fieldset className="abilities-input" style={{ marginTop: 8 }}>
              <legend>Efecto con bonos (CA, daño, resistencia, ventaja…)</legend>
              <p className="muted small" style={{ margin: "0 0 6px" }}>Crea un buff/debuff que la hoja aplica de verdad. Para efectos acumulables (p. ej. el Licor por sorbos), edítalo o añade otro al subir el nivel.</p>
              <div className="row wrap">
                <input placeholder="Nombre (p. ej. Licor 3 sorbos)" value={cxName} onChange={(e) => setCxName(e.target.value)} style={{ minWidth: 180 }} />
                <input type="number" min={1} placeholder="rondas (opcional)" value={cxRounds} onChange={(e) => setCxRounds(e.target.value === "" ? "" : Number(e.target.value))} style={{ maxWidth: 130 }} />
              </div>
              {cxRows.map((r, i) => {
                const def = EFF_KINDS.find((k) => k.k === r.kind);
                return (
                  <div key={i} className="row wrap" style={{ marginTop: 6, alignItems: "center" }}>
                    <select value={r.kind} onChange={(e) => setCxRow(i, { kind: e.target.value })} style={{ flex: 1, minWidth: 180 }}>
                      {EFF_KINDS.map((k) => <option key={k.k} value={k.k}>{k.label}</option>)}
                    </select>
                    {def?.dice && <input placeholder="1d6" value={r.value} onChange={(e) => setCxRow(i, { value: e.target.value })} style={{ maxWidth: 80 }} />}
                    {def?.num && <input type="number" value={r.value} onChange={(e) => setCxRow(i, { value: e.target.value })} style={{ maxWidth: 80 }} />}
                    {def?.dtype && <select value={r.dtype} onChange={(e) => setCxRow(i, { dtype: e.target.value })} style={{ maxWidth: 130 }}>{DTYPES.map((d) => <option key={d} value={d}>{d}</option>)}</select>}
                    {def?.abil && <select value={r.ability} onChange={(e) => setCxRow(i, { ability: e.target.value })} style={{ maxWidth: 110 }}>{ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_LABEL[a]}</option>)}</select>}
                    <button type="button" className="icon-btn" title="Quitar" onClick={() => setCxRows((rs) => rs.filter((_, j) => j !== i))}>🗑</button>
                  </div>
                );
              })}
              <div className="row wrap" style={{ marginTop: 8 }}>
                <button type="button" className="btn small" onClick={() => setCxRows((rs) => [...rs, { kind: "ac", value: "1", ability: "con", dtype: "radiante" }])}>+ Añadir bono</button>
                <button type="button" className="btn small primary" disabled={busy || !cxName.trim()} onClick={() => run(async () => {
                  await api.effects(id, { action: "add", name: cxName.trim(), rounds: cxRounds || undefined, mechanics: cxRows.map(toMod) });
                  setCxName(""); setCxRounds(""); setCxRows([{ kind: "ac", value: "2", ability: "con", dtype: "radiante" }]);
                }, "Efecto personalizado añadido")}>Añadir efecto</button>
              </div>
            </fieldset>
          )}
        </div>
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
