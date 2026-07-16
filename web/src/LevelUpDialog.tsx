import { useEffect, useMemo, useState } from "react";
import { api, type LevelChoice } from "./api";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type ContentHit } from "./types";

// Niveles de mejora de característica/dote por clase (2024): el Guerrero gana extra en 6/14, el Pícaro en 10.
const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);
const ASI_EXTRA: Record<string, number[]> = { fighter: [6, 14], rogue: [10] };
const asiLevelsFor = (cls: string, lvl: number) => ASI_LEVELS.has(lvl) || (ASI_EXTRA[cls.toLowerCase()] ?? []).includes(lvl);
const HIT_DICE: Record<string, number> = { Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8, Artificer: 8, Sorcerer: 6, Wizard: 6 };
const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
interface Mc { armor?: string[]; weapons?: string[]; tools?: string[]; skillCount?: number; skillOptions?: string[] }

export function LevelUpDialog({ id, classList, onClose, onDone }: {
  id: string;
  classList: { name: string; subclass: string | null; level: number }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [classes, setClasses] = useState<ContentHit[]>([]);
  const [feats, setFeats] = useState<ContentHit[]>([]);
  const [subclasses, setSubclasses] = useState<ContentHit[]>([]);
  const [className, setClassName] = useState(classList[0]?.name ?? "");
  const [subclass, setSubclass] = useState("");
  const [hpMode, setHpMode] = useState<"average" | "roll">("average");
  const [hpRoll, setHpRoll] = useState(1);
  const [asiMode, setAsiMode] = useState<"asi" | "feat">("asi");
  const [asi, setAsi] = useState<Partial<Record<AbilityKey, number>>>({});
  const [feat, setFeat] = useState("");
  const [mc, setMc] = useState<Mc | null>(null);
  const [mcSkills, setMcSkills] = useState<string[]>([]);
  const [choices, setChoices] = useState<LevelChoice[]>([]);
  const [chosen, setChosen] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.content("class").then(setClasses);
    void api.content("feat").then((f) => { setFeats(f); setFeat((prev) => prev || f[0]?.name || ""); });
  }, []);

  // Subclases de la clase seleccionada (filtradas por data.class, no por texto).
  useEffect(() => {
    if (!className) { setSubclasses([]); return; }
    void api.subclassesFor(className).then((subs) => {
      setSubclasses(subs);
      setSubclass(subs[0]?.name ?? "");
    });
  }, [className]);

  const existing = classList.find((c) => c.name.toLowerCase() === className.toLowerCase());
  const resultingLevel = existing ? existing.level + 1 : 1;
  const grantsSubclass = resultingLevel === 3 && !existing?.subclass;
  const grantsASI = asiLevelsFor(className, resultingLevel);
  const isMulticlass = !existing; // clase nueva → toma su primer nivel

  // Competencias de multiclase de la clase seleccionada.
  useEffect(() => {
    if (!className) { setMc(null); return; }
    void api.multiclass(className).then((m) => { setMc(m); setMcSkills([]); }).catch(() => setMc(null));
  }, [className]);

  // Elecciones que concede la clase a este nivel (estilo de combate, invocaciones, metamagia…).
  useEffect(() => {
    if (!className) { setChoices([]); return; }
    void api.classChoices(className, resultingLevel).then((ch) => { setChoices(ch); setChosen({}); }).catch(() => setChoices([]));
  }, [className, resultingLevel]);

  const toggleOption = (kind: string, name: string, max: number) => setChosen((cur) => {
    const list = cur[kind] ?? [];
    const next = list.includes(name) ? list.filter((x) => x !== name) : list.length < max ? [...list, name] : list;
    return { ...cur, [kind]: next };
  });

  const classOptions = useMemo(() => {
    const names = new Set(classList.map((c) => c.name));
    for (const c of classes) names.add(c.name);
    return [...names];
  }, [classList, classes]);

  const selectedFeat = feats.find((f) => f.name === feat);
  const selectedSubclass = subclasses.find((s) => s.name === subclass);
  const hitDie = HIT_DICE[className] ?? 8;

  async function rollHp() {
    try {
      const r = (await api.roll(`1d${hitDie}`)) as { rolls: { total: number }[] };
      setHpRoll(r.rolls[0].total);
    } catch { /* ignora errores de red aquí */ }
  }

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
      if (isMulticlass && mc?.skillCount && mcSkills.length) body["skills"] = mcSkills;
      const opts = Object.values(chosen).flat();
      if (opts.length) body["options"] = opts;
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

          {isMulticlass && mc && (
            <fieldset className="abilities-input span2">
              <legend>Multiclase: competencias de {className}</legend>
              <p className="muted small">
                {[mc.armor?.length ? `Armadura: ${mc.armor.join(", ")}` : "", mc.weapons?.length ? `Armas: ${mc.weapons.join(", ")}` : "", mc.tools?.length ? `Herramientas: ${mc.tools.join(", ")}` : ""].filter(Boolean).join(" · ") || "Esta clase no añade competencias al multiclasear."}
              </p>
              {mc.skillCount ? (
                <>
                  <p className="muted small" style={{ margin: "4px 0 0" }}>Elige {mc.skillCount} habilidad ({mcSkills.length}/{mc.skillCount}):</p>
                  <div className="chips">
                    {(mc.skillOptions ?? []).map((sk) => {
                      const on = mcSkills.includes(sk);
                      return (
                        <button type="button" key={sk} className={`chip${on ? " removable" : ""}`}
                          onClick={() => setMcSkills((cur) => cur.includes(sk) ? cur.filter((x) => x !== sk) : cur.length < (mc.skillCount ?? 0) ? [...cur, sk] : cur)}>
                          {on ? "✓ " : ""}{SKILL_LABEL[sk] ?? sk}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </fieldset>
          )}

          {grantsSubclass && (
            <div className="field span2"><span>✨ Subclase (se elige a nivel 3)</span>
              {subclasses.length > 0 ? (
                <>
                  <select value={subclass} onChange={(e) => setSubclass(e.target.value)}>
                    {subclasses.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                  </select>
                  {selectedSubclass?.preview && <p className="spell-desc">{selectedSubclass.preview}</p>}
                </>
              ) : (
                <input value={subclass} onChange={(e) => setSubclass(e.target.value)} placeholder="Escribe la subclase…" />
              )}
            </div>
          )}

          {choices.map((ch) => (
            <fieldset key={ch.kind} className="abilities-input span2">
              <legend>{ch.label} — elige {ch.count} ({(chosen[ch.kind] ?? []).length}/{ch.count})</legend>
              {ch.note && <p className="muted small" style={{ margin: "0 0 4px" }}>{ch.note}</p>}
              <div className="chips">
                {ch.options.map((o) => {
                  const on = (chosen[ch.kind] ?? []).includes(o.name);
                  return (
                    <button type="button" key={o.name} className={`chip${on ? " removable" : ""}`}
                      title={[o.prerequisite ? `Requisito: ${o.prerequisite}` : "", o.summary ?? ""].filter(Boolean).join(" — ")}
                      onClick={() => toggleOption(ch.kind, o.name, ch.count)}>
                      {on ? "✓ " : ""}{o.name}
                    </button>
                  );
                })}
                {ch.options.length === 0 && <span className="muted small">Sin opciones cargadas — re-sincroniza el contenido.</span>}
              </div>
            </fieldset>
          ))}

          <fieldset className="abilities-input span2">
            <legend>Puntos de golpe</legend>
            <div className="row wrap">
              <label className="inline"><input type="radio" checked={hpMode === "average"} onChange={() => setHpMode("average")} /> Promedio fijo</label>
              <label className="inline"><input type="radio" checked={hpMode === "roll"} onChange={() => setHpMode("roll")} /> Tirada</label>
              {hpMode === "roll" && (
                <>
                  <button type="button" className="btn small primary" onClick={rollHp}>🎲 Tirar d{hitDie}</button>
                  <input type="number" min={1} max={hitDie} value={hpRoll} onChange={(e) => setHpRoll(Number(e.target.value))} style={{ maxWidth: 80 }} title="Resultado de la tirada (editable)" />
                </>
              )}
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
