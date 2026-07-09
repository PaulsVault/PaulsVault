import { ABILITIES, ABILITY_LABEL, type Sheet } from "./types";

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
const modeBadge = (mode: string) => (mode === "advantage" ? "▲ ventaja" : mode === "disadvantage" ? "▼ desventaja" : "");

export function CharacterSheet({ sheet: s }: { sheet: Sheet }) {
  const m = s.modifiers;
  return (
    <div className="sheet-grid">
      <section className="stat-row">
        <Stat label="CA" value={s.ac} sub={s.ac !== s.acBase ? `base ${s.acBase}` : s.acFormula} highlight={s.ac !== s.acBase} />
        <Stat label="Velocidad" value={`${s.speed} ft`} sub={s.speed !== s.speedBase ? `base ${s.speedBase}` : undefined} highlight={s.speed !== s.speedBase} />
        <Stat label="Iniciativa" value={fmt(s.initiative)} sub={modeBadge(m.initiative.mode)} />
        <Stat label="Comp." value={fmt(s.proficiencyBonus)} />
        <Stat label="Perc. pasiva" value={s.passivePerception} />
      </section>

      <div className="sheet-cols">
        <section className="panel">
          <h2>Características</h2>
          <div className="abil-cards">
            {ABILITIES.map((a) => (
              <div key={a} className="abil-card">
                <span className="abil-name">{ABILITY_LABEL[a]}</span>
                <span className="abil-mod">{fmt(s.abilities[a].mod)}</span>
                <span className="abil-score">{s.abilities[a].score}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <h2>Salvaciones</h2>
          <ul className="line-list">
            {ABILITIES.map((a) => {
              const save = m.saves[a];
              return (
                <li key={a} className={save.autofail ? "autofail" : ""}>
                  <span>{ABILITY_LABEL[a]}</span>
                  <span className="val">
                    {fmt(s.saves[a])}
                    {save.autofail && <em> auto-fallo</em>}
                    {!save.autofail && save.mode !== "normal" && <em> {modeBadge(save.mode)}</em>}
                    {save.bonuses.map((b, i) => <em key={i}> {b}</em>)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel">
          <h2>Habilidades</h2>
          <ul className="line-list skills">
            {Object.entries(s.skills).map(([k, v]) => (
              <li key={k}><span>{SKILL_LABEL[k] ?? k}</span><span className="val">{fmt(v)}</span></li>
            ))}
          </ul>
        </section>
      </div>

      {s.style.customCss && <style>{s.style.customCss}</style>}
    </div>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string | number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`stat${highlight ? " changed" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}
