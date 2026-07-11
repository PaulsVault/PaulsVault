import { useState } from "react";
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

export interface RollReq { type: string; target?: string; label: string; critical?: boolean; faces?: number; }

export function CharacterSheet({ sheet: s, onRoll }: { sheet: Sheet; onRoll: (r: RollReq) => void }) {
  const m = s.modifiers;
  const [showFeatures, setShowFeatures] = useState(false);
  const dmgFaces = (dmg: string | null) => { const x = dmg?.match(/d(\d+)/); return x ? Number(x[1]) : undefined; };

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
            <ul className="line-list">
              {s.weapons.map((w) => (
                <li key={w.id} className="weapon-row">
                  <span>{w.name}{w.equipped ? "" : " (guardada)"}<em className="muted small"> {w.damage}</em></span>
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
                  <span>{ct.name}</span>
                  <button className="btn small" onClick={() => onRoll({ type: "spell_attack", label: `${ct.name} — ataque de conjuro` })}>Ataque de conjuro</button>
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
