import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { LevelUpDialog } from "./LevelUpDialog";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type ContentHit, type Sheet } from "./types";

type ClassLine = { name: string; subclass: string | null; level: number };
const totalOf = (cl: ClassLine[]) => cl.reduce((s, c) => s + c.level, 0);

const STANDARD = [15, 14, 13, 12, 10, 8];
const PB_COST: Record<number, number> = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const PB_BUDGET = 27;
const roll4d6 = () => { const d = () => Math.floor(Math.random() * 6) + 1; const r = [d(), d(), d(), d()].sort((a, b) => b - a); return r[0] + r[1] + r[2]; };
const mod = (score: number) => Math.floor((score - 10) / 2);
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
const ALL_SKILLS = Object.keys(SKILL_LABEL);
const CUSTOM_BG = "__custom__"; // valor centinela para "trasfondo personalizado"

type Method = "standard" | "pointbuy" | "roll" | "manual";
interface BgData { abilities?: string[]; skills?: string[]; tool?: string; feat?: string; description?: string }
interface ClassData { skillChoices?: number; skillOptions?: string[] }
interface AncestryChoice { trait: string; options: { name: string; description: string }[] }
interface SpeciesData { ancestryChoices?: AncestryChoice[] }

export function CreateCharacter({ onCancel, onCreated }: { onCancel: () => void; onCreated: (s: Sheet) => void }) {
  const [classes, setClasses] = useState<ContentHit[]>([]);
  const [species, setSpecies] = useState<ContentHit[]>([]);
  const [backgrounds, setBackgrounds] = useState<ContentHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [speciesName, setSpeciesName] = useState("");
  const [background, setBackground] = useState("");
  const [level, setLevel] = useState(1);

  // Método de puntuaciones
  const [method, setMethod] = useState<Method>("standard");
  const [pool, setPool] = useState<number[]>(STANDARD);                                   // valores a repartir (standard/roll)
  const [assign, setAssign] = useState<Record<AbilityKey, number | null>>({ str: null, dex: null, con: null, int: null, wis: null, cha: null }); // ability → índice del pool
  const [scores, setScores] = useState<Record<AbilityKey, number>>({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }); // pointbuy/manual

  // Trasfondo: bono +2/+1
  const [bg, setBg] = useState<BgData | null>(null);
  const [bonusMode, setBonusMode] = useState<"2-1" | "1-1-1">("2-1");
  const [plus2, setPlus2] = useState<AbilityKey | "">("");
  const [plus1, setPlus1] = useState<AbilityKey | "">("");

  // Trasfondo personalizado
  const [feats, setFeats] = useState<ContentHit[]>([]);
  const [customName, setCustomName] = useState("Personalizado");
  const [customBgSkills, setCustomBgSkills] = useState<string[]>([]);
  const [customTool, setCustomTool] = useState("");
  const [customFeat, setCustomFeat] = useState("");
  const isCustomBg = background === CUSTOM_BG;

  // Clase: habilidades a elegir
  const [cls, setCls] = useState<ClassData | null>(null);
  const [chosenSkills, setChosenSkills] = useState<string[]>([]);

  // Especie: ascendencia/linaje a elegir
  const [speciesData, setSpeciesData] = useState<SpeciesData | null>(null);
  const [ancestry, setAncestry] = useState<Record<string, string>>({});

  // Creación guiada a nivel alto: tras crear a nivel 1, se sube nivel a nivel eligiendo todo.
  const [guide, setGuide] = useState<{ id: string; classList: ClassLine[]; target: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const [cl, sp, bgs, ft] = await Promise.all([api.content("class"), api.content("species"), api.content("background"), api.originFeats()]);
      setClasses(cl); setSpecies(sp); setBackgrounds(bgs); setFeats(ft);
      setClassName(cl[0]?.name ?? ""); setSpeciesName(sp[0]?.name ?? ""); setBackground(bgs[0]?.name ?? "");
    })().catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (!background || background === CUSTOM_BG) { setBg(null); setPlus2(""); setPlus1(""); if (background === CUSTOM_BG) setBonusMode("2-1"); return; }
    void api.getEntry(background).then((e) => {
      setBg(e.data as BgData); setPlus2(""); setPlus1("");
    }).catch(() => setBg(null));
  }, [background]);

  useEffect(() => {
    if (!className) return;
    void api.getEntry(className).then((e) => { setCls(e.data as ClassData); setChosenSkills([]); }).catch(() => setCls(null));
  }, [className]);

  useEffect(() => {
    if (!speciesName) { setSpeciesData(null); setAncestry({}); return; }
    void api.getEntry(speciesName).then((e) => { setSpeciesData(e.data as SpeciesData); setAncestry({}); }).catch(() => setSpeciesData(null));
  }, [speciesName]);

  // Puntuaciones base según el método
  const base: Record<AbilityKey, number> = useMemo(() => {
    if (method === "pointbuy" || method === "manual") return scores;
    return Object.fromEntries(ABILITIES.map((a) => [a, assign[a] != null ? pool[assign[a]!] : 10])) as Record<AbilityKey, number>;
  }, [method, scores, assign, pool]);

  const abilityBonuses: Partial<Record<AbilityKey, number>> = useMemo(() => {
    if (bonusMode === "1-1-1") return Object.fromEntries((bg?.abilities ?? []).map((a) => [a, 1]));
    const out: Partial<Record<AbilityKey, number>> = {};
    if (plus2) out[plus2] = 2;
    if (plus1) out[plus1] = (out[plus1] ?? 0) + 1;
    return out;
  }, [bonusMode, bg, plus2, plus1]);

  const pbUsed = ABILITIES.reduce((s, a) => s + (PB_COST[scores[a]] ?? 0), 0);
  const skillOptions = cls?.skillOptions?.[0] === "*" ? ALL_SKILLS : (cls?.skillOptions ?? []);
  const skillChoices = cls?.skillChoices ?? 0;
  // Características a las que va el +2/+1 y competencias del trasfondo (contenido o personalizado).
  const bgAbilities: string[] = isCustomBg ? [...ABILITIES] : (bg?.abilities ?? []);
  const bgSkills = isCustomBg ? customBgSkills : (bg?.skills ?? []);

  // Validaciones
  const assignedOk = method === "pointbuy" ? pbUsed <= PB_BUDGET
    : method === "manual" ? true
    : ABILITIES.every((a) => assign[a] != null);
  const bonusOk = (bonusMode === "1-1-1" && !isCustomBg) ? (bg?.abilities?.length ?? 0) > 0 : (!!plus2 && !!plus1 && plus2 !== plus1);
  const skillsOk = skillChoices === 0 || chosenSkills.length === skillChoices;
  const customOk = !isCustomBg || customBgSkills.length === 2;
  const ancestryList = speciesData?.ancestryChoices ?? [];
  const ancestryOk = ancestryList.every((ch) => ancestry[ch.trait]);
  const canSubmit = !!name && !!className && assignedOk && bonusOk && skillsOk && customOk && ancestryOk;

  function setAssignFor(a: AbilityKey, idx: number | null) {
    setAssign((prev) => {
      const next = { ...prev };
      // libera el índice si otra característica lo tenía
      for (const k of ABILITIES) if (next[k] === idx) next[k] = null;
      next[a] = idx;
      return next;
    });
  }
  function rollScores() { setPool(Array.from({ length: 6 }, roll4d6)); setAssign({ str: null, dex: null, con: null, int: null, wis: null, cha: null }); }
  function pbSet(a: AbilityKey, v: number) { if (v < 8 || v > 15) return; setScores((s) => ({ ...s, [a]: v })); }
  function toggleSkill(sk: string) {
    setChosenSkills((cur) => cur.includes(sk) ? cur.filter((x) => x !== sk) : cur.length < skillChoices ? [...cur, sk] : cur);
  }

  function switchMethod(m: Method) {
    setMethod(m);
    if (m === "standard") { setPool(STANDARD); setAssign({ str: null, dex: null, con: null, int: null, wis: null, cha: null }); }
    if (m === "roll") { rollScores(); }
    if (m === "pointbuy") setScores({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 });
    if (m === "manual") setScores({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      // Siempre se crea a nivel 1; si el objetivo es mayor, se sube nivel a nivel eligiendo todo (guiado).
      const sheet = await api.createCharacter({
        name, className, species: speciesName, level: 1,
        background: isCustomBg ? (customName.trim() || "Personalizado") : background,
        abilities: base, abilityBonuses, skills: chosenSkills,
        ...(ancestryList.length ? { ancestryChoices: ancestry } : {}),
        ...(isCustomBg ? {
          backgroundSkills: customBgSkills,
          originFeat: customFeat || undefined,
          tools: customTool.trim() ? [customTool.trim()] : undefined,
        } : {}),
      });
      if (level > 1) setGuide({ id: sheet.id, classList: sheet.classList, target: level });
      else onCreated(sheet);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  // Tras cada nivel del guiado: recarga y decide si seguir o terminar.
  async function afterGuidedLevel() {
    if (!guide) return;
    const sheet = await api.getSheet(guide.id);
    if (totalOf(sheet.classList) >= guide.target) onCreated(sheet);
    else setGuide({ id: guide.id, classList: sheet.classList, target: guide.target });
  }
  // Salir del guiado antes de tiempo: se conserva el personaje en su nivel actual.
  async function finishGuidedEarly() {
    if (!guide) return;
    onCreated(await api.getSheet(guide.id));
  }

  // Fase guiada: personaje creado a nivel 1, ahora se sube nivel a nivel eligiendo todo.
  if (guide) {
    const current = totalOf(guide.classList);
    return (
      <section className="create">
        <div className="library-head"><h1>Creación guiada — nivel {current} → {guide.target}</h1></div>
        <p className="note">Tu personaje se creó a nivel 1. Ahora completa cada nivel (mejoras de característica, estilo de combate, subclase…) para no perder nada. Vas por el nivel {current} de {guide.target}.</p>
        <LevelUpDialog
          key={current}
          id={guide.id}
          classList={guide.classList}
          onClose={() => void finishGuidedEarly()}
          onDone={() => void afterGuidedLevel()}
        />
      </section>
    );
  }

  return (
    <section className="create">
      <div className="library-head"><h1>Nuevo personaje</h1><button className="btn" onClick={onCancel}>← Volver</button></div>

      <form className="form" onSubmit={submit}>
        <label className="field span2"><span>Nombre</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del personaje" />
        </label>

        <label className="field"><span>Clase</span>
          <select value={className} onChange={(e) => setClassName(e.target.value)}>{classes.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
        </label>
        <label className="field"><span>Nivel {level > 1 && <em className="muted small">· te guío nivel a nivel</em>}</span>
          <input type="number" min={1} max={20} value={level} onChange={(e) => setLevel(Number(e.target.value))} />
        </label>
        <label className="field"><span>Especie</span>
          <select value={speciesName} onChange={(e) => setSpeciesName(e.target.value)}>{species.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select>
        </label>
        <label className="field"><span>Trasfondo</span>
          <select value={background} onChange={(e) => setBackground(e.target.value)}>
            {backgrounds.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            <option value={CUSTOM_BG}>✏️ Personalizado…</option>
          </select>
        </label>

        {/* ── Puntuaciones ── */}
        <fieldset className="abilities-input span2">
          <legend>Características</legend>
          <div className="row wrap" style={{ marginBottom: 8 }}>
            {(["standard", "pointbuy", "roll", "manual"] as Method[]).map((m) => (
              <label key={m} className="inline"><input type="radio" checked={method === m} onChange={() => switchMethod(m)} /> {({ standard: "Array estándar", pointbuy: "Point Buy", roll: "Tirar dados", manual: "Manual" })[m]}</label>
            ))}
            {method === "roll" && <button type="button" className="btn small" onClick={rollScores}>🎲 Volver a tirar</button>}
            {method === "pointbuy" && <span className={`muted small${pbUsed > PB_BUDGET ? " error" : ""}`}>Puntos: {pbUsed}/{PB_BUDGET}</span>}
          </div>

          {(method === "standard" || method === "roll") && (
            <>
              <p className="muted small">Valores a repartir: {pool.map((v, i) => <b key={i} style={{ marginRight: 8 }}>{v}</b>)}</p>
              <div className="abil-grid">
                {ABILITIES.map((a) => (
                  <label key={a} className="abil-field"><span>{ABILITY_LABEL[a]} {abilityBonuses[a] ? <em className="muted">{fmt(abilityBonuses[a]!)}</em> : ""}</span>
                    <select value={assign[a] ?? ""} onChange={(e) => setAssignFor(a, e.target.value === "" ? null : Number(e.target.value))}>
                      <option value="">—</option>
                      {pool.map((v, i) => (
                        <option key={i} value={i} disabled={ABILITIES.some((k) => k !== a && assign[k] === i)}>{v}</option>
                      ))}
                    </select>
                    <span className="muted small">= {base[a] + (abilityBonuses[a] ?? 0)} ({fmt(mod(base[a] + (abilityBonuses[a] ?? 0)))})</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {(method === "pointbuy" || method === "manual") && (
            <div className="abil-grid">
              {ABILITIES.map((a) => (
                <label key={a} className="abil-field"><span>{ABILITY_LABEL[a]} {abilityBonuses[a] ? <em className="muted">{fmt(abilityBonuses[a]!)}</em> : ""}</span>
                  {method === "pointbuy"
                    ? <select value={scores[a]} onChange={(e) => pbSet(a, Number(e.target.value))}>{[8, 9, 10, 11, 12, 13, 14, 15].map((v) => <option key={v} value={v}>{v} ({PB_COST[v]}p)</option>)}</select>
                    : <input type="number" min={1} max={30} value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: Number(e.target.value) })} />}
                  <span className="muted small">= {base[a] + (abilityBonuses[a] ?? 0)} ({fmt(mod(base[a] + (abilityBonuses[a] ?? 0)))})</span>
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {/* ── Bono del trasfondo ── */}
        <fieldset className="abilities-input span2">
          <legend>Mejora de característica del trasfondo{isCustomBg ? " (personalizado: elige)" : bg?.abilities?.length ? ` (${bg.abilities.map((a) => ABILITY_LABEL[a as AbilityKey]).join(", ")})` : ""}</legend>
          {!bgAbilities.length ? <p className="muted small">Este trasfondo no define características (elige otro o usa Manual).</p> : (
            <>
              <div className="row wrap">
                <label className="inline"><input type="radio" checked={bonusMode === "2-1"} onChange={() => setBonusMode("2-1")} /> +2 y +1</label>
                {!isCustomBg && <label className="inline"><input type="radio" checked={bonusMode === "1-1-1"} onChange={() => setBonusMode("1-1-1")} /> +1 a las tres</label>}
              </div>
              {(bonusMode === "2-1" || isCustomBg) && (
                <div className="row wrap" style={{ marginTop: 6 }}>
                  <label className="field"><span>+2 a</span>
                    <select value={plus2} onChange={(e) => setPlus2(e.target.value as AbilityKey)}>
                      <option value="">—</option>
                      {bgAbilities.map((a) => <option key={a} value={a}>{ABILITY_LABEL[a as AbilityKey]}</option>)}
                    </select>
                  </label>
                  <label className="field"><span>+1 a</span>
                    <select value={plus1} onChange={(e) => setPlus1(e.target.value as AbilityKey)}>
                      <option value="">—</option>
                      {bgAbilities.filter((a) => a !== plus2).map((a) => <option key={a} value={a}>{ABILITY_LABEL[a as AbilityKey]}</option>)}
                    </select>
                  </label>
                </div>
              )}
            </>
          )}
          {bg?.feat && <p className="muted small" style={{ margin: "6px 0 0" }}>🎁 Dote de origen: <b>{bg.feat}</b>{bgSkills.length ? ` · Competencias: ${bgSkills.map((s) => SKILL_LABEL[s] ?? s).join(", ")}` : ""}{bg.tool ? ` · ${bg.tool}` : ""}</p>}
          {bg?.description && <p className="cond-desc" style={{ margin: "8px 0 0" }}>{bg.description}</p>}
        </fieldset>

        {/* ── Trasfondo personalizado ── */}
        {isCustomBg && (
          <fieldset className="abilities-input span2">
            <legend>Trasfondo personalizado</legend>
            <label className="field span2"><span>Nombre del trasfondo</span>
              <input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="p.ej. Erudito errante" />
            </label>
            <p className="muted small" style={{ margin: "8px 0 0" }}>Competencias del trasfondo — elige 2 ({customBgSkills.length}/2):</p>
            <div className="chips">
              {ALL_SKILLS.map((sk) => {
                const on = customBgSkills.includes(sk);
                return (
                  <button type="button" key={sk} className={`chip${on ? " removable" : ""}`}
                    onClick={() => setCustomBgSkills((cur) => cur.includes(sk) ? cur.filter((x) => x !== sk) : cur.length < 2 ? [...cur, sk] : cur)}>
                    {on ? "✓ " : ""}{SKILL_LABEL[sk] ?? sk}
                  </button>
                );
              })}
            </div>
            <div className="row wrap" style={{ marginTop: 8 }}>
              <label className="field"><span>Herramienta (opcional)</span>
                <input value={customTool} onChange={(e) => setCustomTool(e.target.value)} placeholder="p.ej. Herramientas de ladrón" />
              </label>
              <label className="field"><span>Dote de origen (opcional)</span>
                <select value={customFeat} onChange={(e) => setCustomFeat(e.target.value)}>
                  <option value="">— ninguna —</option>
                  {feats.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                </select>
              </label>
            </div>
          </fieldset>
        )}

        {/* ── Habilidades de clase ── */}
        {skillChoices > 0 && (
          <fieldset className="abilities-input span2">
            <legend>Habilidades de clase — elige {skillChoices} ({chosenSkills.length}/{skillChoices})</legend>
            <div className="chips">
              {skillOptions.map((sk) => {
                const already = bgSkills.includes(sk);
                const on = chosenSkills.includes(sk);
                return (
                  <button type="button" key={sk} className={`chip${on ? " removable" : ""}`} disabled={already}
                    title={already ? "Ya la da tu trasfondo" : ""} onClick={() => toggleSkill(sk)}>
                    {on ? "✓ " : ""}{SKILL_LABEL[sk] ?? sk}{already ? " (trasfondo)" : ""}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {/* ── Ascendencia / linaje de la especie ── */}
        {ancestryList.length > 0 && (
          <fieldset className="abilities-input span2">
            <legend>Ascendencia / linaje de {speciesName}</legend>
            {ancestryList.map((ch) => {
              const sel = ch.options.find((o) => o.name === ancestry[ch.trait]);
              return (
                <label key={ch.trait} className="field span2"><span>{ch.trait} — elige uno</span>
                  <select value={ancestry[ch.trait] ?? ""} onChange={(e) => setAncestry((a) => ({ ...a, [ch.trait]: e.target.value }))}>
                    <option value="">—</option>
                    {ch.options.map((o) => <option key={o.name} value={o.name}>{o.name}</option>)}
                  </select>
                  {sel?.description && <p className="cond-desc" style={{ margin: "6px 0 0" }}>{sel.description}</p>}
                </label>
              );
            })}
          </fieldset>
        )}

        {error && <p className="error span2">⚠️ {error}</p>}
        <div className="span2 form-actions">
          <button className="btn primary" type="submit" disabled={busy || !canSubmit}>{busy ? "Creando…" : "Crear personaje"}</button>
        </div>
      </form>
    </section>
  );
}
