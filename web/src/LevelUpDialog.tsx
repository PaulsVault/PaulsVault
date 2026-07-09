import { useEffect, useState } from "react";
import { api } from "./api";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type ContentHit } from "./types";

export function LevelUpDialog({ id, defaultClass, onClose, onDone }: { id: string; defaultClass: string; onClose: () => void; onDone: () => void }) {
  const [classes, setClasses] = useState<ContentHit[]>([]);
  const [className, setClassName] = useState(defaultClass);
  const [subclass, setSubclass] = useState("");
  const [hpMode, setHpMode] = useState<"average" | "roll">("average");
  const [hpRoll, setHpRoll] = useState(1);
  const [asi, setAsi] = useState<Partial<Record<AbilityKey, number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.content("class").then((cs) => { setClasses(cs); if (!cs.some((c) => c.name === defaultClass)) setClassName(cs[0]?.name ?? defaultClass); });
  }, [defaultClass]);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const increases = Object.fromEntries(Object.entries(asi).filter(([, v]) => v && v !== 0));
      await api.levelUp(id, {
        className,
        subclass: subclass || undefined,
        hpRoll: hpMode === "roll" ? hpRoll : undefined,
        abilityIncreases: Object.keys(increases).length ? increases : undefined,
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="library-head">
          <h2 style={{ margin: 0 }}>Subir de nivel</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="muted small">Sube una clase existente o elige otra para multiclase (entra a nivel 1).</p>

        <div className="form">
          <label className="field"><span>Clase</span>
            <select value={className} onChange={(e) => setClassName(e.target.value)}>
              {classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Subclase (opcional)</span>
            <input value={subclass} onChange={(e) => setSubclass(e.target.value)} placeholder="p.ej. Evoker" />
          </label>

          <fieldset className="abilities-input span2">
            <legend>Puntos de golpe</legend>
            <div className="row wrap">
              <label className="inline"><input type="radio" checked={hpMode === "average"} onChange={() => setHpMode("average")} /> Promedio fijo</label>
              <label className="inline"><input type="radio" checked={hpMode === "roll"} onChange={() => setHpMode("roll")} /> Tirada</label>
              {hpMode === "roll" && <input type="number" min={1} max={12} value={hpRoll} onChange={(e) => setHpRoll(Number(e.target.value))} style={{ maxWidth: 80 }} />}
            </div>
          </fieldset>

          <fieldset className="abilities-input span2">
            <legend>Mejora de característica (ASI, opcional)</legend>
            <div className="abil-grid">
              {ABILITIES.map((a) => (
                <label key={a} className="abil-field">
                  <span>{ABILITY_LABEL[a]}</span>
                  <input type="number" min={0} max={2} value={asi[a] ?? 0} onChange={(e) => setAsi({ ...asi, [a]: Number(e.target.value) })} />
                </label>
              ))}
            </div>
          </fieldset>

          {error && <p className="error span2">⚠️ {error}</p>}
          <div className="span2 form-actions">
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Subiendo…" : "Confirmar"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
