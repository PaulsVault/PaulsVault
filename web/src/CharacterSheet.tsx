import { useState } from "react";
import { api } from "./api";
import { FeatureDesc } from "./FeatureDesc";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type Sheet } from "./types";

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
const modeBadge = (mode: string) => (mode === "advantage" ? "▲ ventaja" : mode === "disadvantage" ? "▼ desventaja" : "");

export interface RollReq { type: string; target?: string; label: string; critical?: boolean; faces?: number; damageExpr?: string; damageType?: string; }

export function CharacterSheet({ sheet: s, onRoll, id, reload }: { sheet: Sheet; onRoll: (r: RollReq) => void; id: string; reload: () => Promise<void> }) {
  const m = s.modifiers;
  const [showFeatures, setShowFeatures] = useState(false);
  const [busyUse, setBusyUse] = useState(false);
  const dmgFaces = (dmg: string | null) => { const x = dmg?.match(/d(\d+)/); return x ? Number(x[1]) : undefined; };

  // Maestrías de arma (regla 2024): editor con selector de armas elegibles.
  const wm = s.weaponMastery;
  const [editMastery, setEditMastery] = useState(false);
  const [mastOpts, setMastOpts] = useState<{ name: string; mastery: string[] }[]>([]);
  const [mastSel, setMastSel] = useState<string[]>([]);
  const [mastBusy, setMastBusy] = useState(false);
  const chosenWeapons = [...new Set((wm?.chosen ?? []).map((m) => m.weapon))];
  async function openMasteryEditor() {
    setMastSel(chosenWeapons);
    setEditMastery(true);
    try { setMastOpts((await api.masteryOptions(id)).options); } catch { setMastOpts([]); }
  }
  const toggleMast = (name: string) => setMastSel((cur) =>
    cur.includes(name) ? cur.filter((x) => x !== name) : cur.length < (wm?.max ?? 0) ? [...cur, name] : cur);
  async function saveMasteries() {
    setMastBusy(true);
    try { await api.setMasteries(id, mastSel); await reload(); setEditMastery(false); }
    finally { setMastBusy(false); }
  }

  // Rasgos con cargas (Ancestría del Goliath, dotes con usos…): gastar/restaurar un uso.
  const usableFeatures = s.features.filter((f) => f.uses && f.uses.max > 0);
  const RECHARGE_LABEL: Record<string, string> = { short_rest: "descanso corto", long_rest: "descanso largo", dawn: "amanecer", manual: "manual" };
  async function useFeature(name: string, delta: number) {
    setBusyUse(true);
    try { await api.featureUse(id, name, delta); await reload(); }
    finally { setBusyUse(false); }
  }

  // Detalles de cálculo, mostrados al pasar el cursor (hover), no siempre visibles.
  const acDetail = s.acFormula + (m.ac.sources.length ? " · " + m.ac.sources.join(", ") : "");
  const speedDetail = `Base ${s.speedBase} ft` + (m.speed.sources.length ? " · " + m.speed.sources.join(", ") : "");
  const initDetail = `DES(${fmt(s.abilities.dex.mod)})` + (m.initiative.bonuses.length ? " + " + m.initiative.bonuses.join(", ") : "");

  return (
    <div className="sheet-grid">
      <p className="muted small roll-hint">🎲 Toca una habilidad, salvación, característica, iniciativa, arma o truco para tirar. Pasa el cursor sobre un valor para ver de dónde sale.</p>

      <section className="stat-row">
        <Stat label="CA" value={s.ac} detail={acDetail} highlight={s.ac !== s.acBase} />
        <Stat label="Velocidad" value={`${s.speed} ft`} detail={speedDetail} highlight={s.speed !== s.speedBase} />
        <Stat label="Iniciativa" value={fmt(s.initiative)} detail={initDetail} sub={modeBadge(m.initiative.mode) || "🎲 tirar"} onClick={() => onRoll({ type: "initiative", label: "Iniciativa" })} />
        <Stat label="Comp." value={fmt(s.proficiencyBonus)} detail="Bono de competencia (según tu nivel)" />
        <Stat label="Perc. pasiva" value={s.passivePerception} detail="10 + tu bono de Percepción" />
      </section>

      <div className="sheet-cols">
        <div className="sheet-col">
        <section className="panel">
          <h2>Características</h2>
          <div className="abil-cards">
            {ABILITIES.map((a) => (
              <button key={a} className="abil-card clickable" title={`Prueba de ${ABILITY_LABEL[a]}`}
                onClick={() => onRoll({ type: "ability", target: a, label: `Prueba de ${ABILITY_LABEL[a]}` })}>
                <span className="abil-name">{ABILITY_LABEL[a]}</span>
                <span className="abil-mod">{fmt(s.abilities[a].mod)}</span>
                <span className="abil-score">{s.abilities[a].score}</span>
              </button>
            ))}
          </div>
        </section>

        {usableFeatures.length > 0 && (
          <section className="panel">
            <h2>⚡ Rasgos usables (cargas)</h2>
            <ul className="line-list">
              {usableFeatures.map((f) => {
                const u = f.uses!;
                const left = u.max - u.used;
                return (
                  <li key={`${f.name}-${f.source}`} style={{ display: "block" }}>
                    <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                      <b>{f.name}</b>
                      <span className="row" style={{ gap: 6, alignItems: "center" }}>
                        <span title={`Se recarga en: ${RECHARGE_LABEL[u.recharge] ?? u.recharge}`}>
                          {"●".repeat(left)}{"○".repeat(u.used)} <span className="muted small">{left}/{u.max}</span>
                        </span>
                        <button className="icon-btn" title="Gastar un uso" disabled={busyUse || left <= 0} onClick={() => useFeature(f.name, 1)}>−</button>
                        <button className="icon-btn" title="Restaurar un uso" disabled={busyUse || u.used <= 0} onClick={() => useFeature(f.name, -1)}>＋</button>
                      </span>
                    </div>
                    <p className="muted small" style={{ margin: "2px 0 0" }}>Recarga: {RECHARGE_LABEL[u.recharge] ?? u.recharge}. {f.source}</p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {s.resistances && s.resistances.length > 0 && (
          <section className="panel">
            <h2>🛡️ Resistencias a daño</h2>
            <div className="chips">
              {s.resistances.map((r) => <span key={r} className="chip">{r}</span>)}
            </div>
          </section>
        )}

        {wm && wm.max > 0 && (
          <section className="panel">
            <h2 className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <span>⚔️ Maestrías de arma <span className="muted small">({chosenWeapons.length}/{wm.max})</span></span>
              {!editMastery && <button className="btn small" onClick={openMasteryEditor}>Elegir</button>}
            </h2>
            {!editMastery ? (
              wm.chosen.length > 0 ? (
                <ul className="line-list">
                  {wm.chosen.map((m) => (
                    <li key={`${m.weapon}-${m.mastery}`} style={{ display: "block" }}>
                      <div><b>{m.weapon}</b> — <span className="accent">{m.mastery}</span></div>
                      {m.description && <p className="muted small" style={{ margin: "2px 0 0" }}>{m.description}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="muted small">Aún no eliges tus maestrías. Puedes usar la propiedad de maestría de {wm.max} arma(s). Toca «Elegir».</p>
            ) : (
              <>
                <p className="muted small" style={{ margin: "0 0 4px" }}>Elige hasta {wm.max} arma(s) competente(s) ({mastSel.length}/{wm.max}). Puedes cambiarlas en cada descanso largo.</p>
                <div className="chips">
                  {mastOpts.map((o) => {
                    const on = mastSel.includes(o.name);
                    return (
                      <button type="button" key={o.name} className={`chip${on ? " removable" : ""}`} title={o.mastery.join(", ")}
                        onClick={() => toggleMast(o.name)}>
                        {on ? "✓ " : ""}{o.name} <span className="muted small">({o.mastery.join("/")})</span>
                      </button>
                    );
                  })}
                  {mastOpts.length === 0 && <span className="muted small">Cargando armas… (si no aparecen, re-sincroniza el contenido).</span>}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn small" onClick={() => setEditMastery(false)}>Cancelar</button>
                  <button className="btn small primary" disabled={mastBusy} onClick={saveMasteries}>{mastBusy ? "Guardando…" : "Guardar"}</button>
                </div>
              </>
            )}
          </section>
        )}

        {s.features.length > 0 && (
          <section className="panel">
            <h2 className="collapse-h" onClick={() => setShowFeatures((v) => !v)} title="Mostrar/ocultar">
              <span>Rasgos y dotes <span className="muted small">({s.features.length})</span></span>
              <span className="muted">{showFeatures ? "▲" : "▼"}</span>
            </h2>
            {showFeatures && (
              <ul className="line-list">
                {s.features.map((f) => (
                  <li key={`${f.name}-${f.source}`} style={{ display: "block" }}>
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <b>{f.name}</b><span className="muted small">{f.source}</span>
                    </div>
                    {f.description
                      ? <FeatureDesc text={f.description} />
                      : <p className="feat-desc muted">Sin descripción cargada. Re-sincroniza el contenido para ver qué hace.</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        </div>

        <div className="sheet-col">
        <section className="panel">
          <h2>Salvaciones</h2>
          <ul className="line-list">
            {ABILITIES.map((a) => {
              const save = m.saves[a];
              return (
                <li key={a} className={`clickable ${save.autofail ? "autofail" : ""}`} title={s.saveDetails[a]}
                  onClick={() => onRoll({ type: "save", target: a, label: `Salvación de ${ABILITY_LABEL[a]}` })}>
                  <span>{ABILITY_LABEL[a]}</span>
                  <span className="val">
                    {fmt(s.saves[a])}
                    {save.autofail && <em> auto-fallo</em>}
                    {!save.autofail && save.mode !== "normal" && <em> {modeBadge(save.mode)}</em>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {s.weapons.length > 0 && (
          <section className="panel">
            <h2>Armas {s.critRange < 20 && <span className="muted small">· crítico {s.critRange}-20</span>}</h2>
            {s.equipmentWarning && <p className="note warn">⚠️ {s.equipmentWarning}</p>}
            <ul className="line-list">
              {s.weapons.map((w) => (
                <li key={w.id} className="weapon-row">
                  <span>{w.name}{w.equipped ? "" : " (guardada)"}<em className="muted small"> {w.damage}</em>{w.proficient === false && <span className="prof-warn"> · ⚠️ sin competencia</span>}</span>
                  <span className="row">
                    <button className="btn small" onClick={() => onRoll({ type: "attack", target: w.name, label: `${w.name} — ataque` })}>Atacar</button>
                    <button className="btn small primary" onClick={() => onRoll({ type: "damage", target: w.name, label: w.name, faces: dmgFaces(w.damage) })}>Daño</button>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {s.cantrips.length > 0 && (
          <section className="panel">
            <h2>Trucos</h2>
            <ul className="line-list">
              {s.cantrips.map((ct) => (
                <li key={ct.name} className="weapon-row">
                  <span>{ct.name}{ct.damage ? <em className="muted small"> {ct.damage}{ct.damageType ? ` ${ct.damageType}` : ""}</em> : ""}</span>
                  <span className="row">
                    <button className="btn small" onClick={() => onRoll({ type: "spell_attack", label: `${ct.name} — ataque de conjuro` })}>Ataque</button>
                    {ct.damage && <button className="btn small primary" onClick={() => onRoll({ type: "spell_damage", label: `${ct.name} — daño`, damageExpr: ct.damage!, damageType: ct.damageType ?? undefined, faces: dmgFaces(ct.damage!) })}>Daño</button>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        </div>

        <div className="sheet-col">
        <section className="panel">
          <h2>Habilidades</h2>
          <ul className="line-list skills">
            {Object.entries(s.skills).map(([k, v]) => (
              <li key={k} className="clickable" title={s.skillDetails[k]}
                onClick={() => onRoll({ type: "skill", target: k, label: SKILL_LABEL[k] ?? k })}>
                <span>{SKILL_LABEL[k] ?? k}</span><span className="val">{fmt(v)}</span>
              </li>
            ))}
          </ul>
        </section>
        </div>
      </div>

      {s.style.customCss && <style>{s.style.customCss}</style>}
    </div>
  );
}

function Stat({ label, value, sub, detail, highlight, onClick }: { label: string; value: string | number; sub?: string; detail?: string; highlight?: boolean; onClick?: () => void }) {
  return (
    <div className={`stat${highlight ? " changed" : ""}${onClick ? " clickable" : detail ? " hoverable" : ""}`} onClick={onClick} title={detail}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
