import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type ContentHit } from "./types";

const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

export function LevelUpDialog({ id, classList, onClose, onDone }: {
  id: string;
  classList: { name: string; subclass: string | null; level: number }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [classes, setClasses] = useState<ContentHit[]>([]);
  const [feats, setFeats] = useState<ContentHit[]>([]);
  const [className, setClassName] = useState(classList[0]?.name ?? "");
  const [subclass, setSubclass] = useState("");
  const [hpMode, setHpMode] = useState<"average" | "roll">("average");
  const [hpRoll, setHpRoll] = useState(1);
  const [asiMode, setAsiMode] = useState<"asi" | "feat">("asi");
  const [asi, setAsi] = useState<Partial<Record<AbilityKey, number>>>({});
  const [feat, setFeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.content("class").then(setClasses);
    void api.content("feat").then((f) => { setFeats(f); setFeat((prev) => prev || f[0]?.name || ""); });
  }, []);

  const existing = classList.find((c) => c.name.toLowerCase() === className.toLowerCase());
  const resultingLevel = existing ? existing.level + 1 : 1;
  const grantsSubclass = resultingLevel === 3 && !existing?.subclass;
  const grantsASI = ASI_LEVELS.has(resultingLevel);

  const classOptions = useMemo(() => {
    const names = new Set(classList.map((c) => c.name));
    for (const c of classes) names.add(c.name);
    return [...names];
  }, [classList, classes]);

  const selectedFeat = feats.find((f) => f.name === feat);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body: Record<string, unknown> = {
        className,
        subclass: grantsSubclass && subclass ? subclass : undefined,
        hpRoll: hpMode === "roll" ? hpRoll : undefined,
      };
      if (grantsASI) {
        if (asiMode === "feat") body["feat"] = feat || undefined;
        else {
          const inc = Object.fromEntries(Object.entries(asi).filter(([, v]) => v && v !== 0));
          if (Object.keys(inc).length) body["abilityIncreases"] = inc;
        }
      }
      await api.levelUp(id, body);
      onDone();
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }

  const lvlOf = (c: string) => classList.find((x) => x.name === c);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="library-head"><h2 style={{ margin: 0 }}>Subir de nivel</h2><button className="icon-btn" onClick={onClose}>✕</button></div>

        <div className="form">
          <label className="field span2"><span>Clase</span>
            <select value={className} onChange={(e) => setClassName(e.target.value)}>
              {classOptions.map((c) => {
                const l = lvlOf(c);
                return <option key={c} value={c}>{c} {l ? `(nv ${l.level} → ${l.level + 1})` : "(multiclase → nv 1)"}</option>;
              })}
            </select>
          </label>
          <p className="muted small span2" style={{ margin: "-6px 0 0" }}>Sube a nivel {resultingLevel} de {className}.</p>

          {grantsSubclass && (
            <label className="field span2"><span>✨ Subclase (se elige a nivel 3)</span>
              <input value={subclass} onChange={(e) => setSubclass(e.target.value)} placeholder="p.ej. Evoker, Champion, Life Domain…" />
            </label>
          )}

          <fieldset className="abilities-input span2">
            <legend>Puntos de golpe</legend>
            <div className="row wrap">
              <label className="inline"><input type="radio" checked={hpMode === "average"} onChange={() => setHpMode("average")} /> Promedio fijo</label>
              <label className="inline"><input type="radio" checked={hpMode === "roll"} onChange={() => setHpMode("roll")} /> Tirada</label>
              {hpMode === "roll" && <input type="number" min={1} max={12} value={hpRoll} onChange={(e) => setHpRoll(Number(e.target.value))} style={{ maxWidth: 80 }} />}
            </div>
          </fieldset>

          {grantsASI && (
            <fieldset className="abilities-input span2">
              <legend>Nivel {resultingLevel}: mejora de característica o dote</legend>
              <div className="row wrap">
                <label className="inline"><input type="radio" checked={asiMode === "asi"} onChange={() => setAsiMode("asi")} /> Mejora de característica</label>
                <label className="inline"><input type="radio" checked={asiMode === "feat"} onChange={() => setAsiMode("feat")} /> Dote</label>
              </div>
              {asiMode === "asi" ? (
                <>
                  <p className="muted small" style={{ margin: "6px 0 0" }}>+2 a una característica o +1 a dos (máx 20).</p>
                  <div className="abil-grid" style={{ marginTop: 6 }}>
                    {ABILITIES.map((a) => (
                      <label key={a} className="abil-field"><span>{ABILITY_LABEL[a]}</span>
                        <input type="number" min={0} max={2} value={asi[a] ?? 0} onChange={(e) => setAsi({ ...asi, [a]: Number(e.target.value) })} />
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <select value={feat} onChange={(e) => setFeat(e.target.value)} style={{ marginTop: 6 }}>
                    {feats.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                  </select>
                  {selectedFeat?.preview && <p className="spell-desc">{selectedFeat.preview}</p>}
                </>
              )}
            </fieldset>
          )}

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
