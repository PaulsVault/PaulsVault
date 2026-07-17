import { useEffect, useState } from "react";
import { api } from "./api";
import { ABILITIES, ABILITY_LABEL, type Sheet } from "./types";

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
interface KnownSpell { name: string; level: number; prepared: boolean; alwaysPrepared?: boolean }

/** Hoja de personaje imprimible: se abre en pantalla y con «Imprimir» el navegador la guarda como PDF. */
export function PrintSheet({ id, sheet: s, onClose }: { id: string; sheet: Sheet; onClose: () => void }) {
  const [spells, setSpells] = useState<KnownSpell[]>([]);
  useEffect(() => {
    if (s.spellcasting) void api.getSpells(id).then((v) => setSpells(((v as { spells?: KnownSpell[] }).spells) ?? [])).catch(() => setSpells([]));
  }, [id, s.spellcasting]);

  const box = (label: string, value: string | number, sub?: string) => (
    <div className="ps-box"><span className="ps-box-l">{label}</span><b className="ps-box-v">{value}</b>{sub && <span className="ps-box-s">{sub}</span>}</div>
  );
  const slots = s.spellcasting?.slots ?? {};
  const spellLevels = [...new Set(spells.map((sp) => sp.level))].sort((a, b) => a - b);
  const currency = Object.entries(s.currency ?? {}).filter(([, v]) => v > 0);

  return (
    <div className="print-root">
      <div className="no-print ps-toolbar">
        <button className="btn primary" onClick={() => window.print()}>🖨️ Imprimir / Guardar PDF</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
        <span className="muted small">En el diálogo de impresión elige «Guardar como PDF» como destino.</span>
      </div>

      <div className="ps-sheet">
        <header className="ps-head">
          <div><h1>{s.name}</h1>
            <p>{s.classList.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / ")} · Nivel {s.level}</p>
            <p className="ps-sub">{s.species} · {s.background}{s.alignment ? ` · ${s.alignment}` : ""}</p>
          </div>
        </header>

        <section className="ps-stats">
          {box("CA", s.ac)}
          {box("PG", `${s.hp.current}/${s.hp.max}`, s.hp.temp ? `+${s.hp.temp} temp` : undefined)}
          {box("Velocidad", `${s.speed} ft`)}
          {box("Iniciativa", fmt(s.initiative))}
          {box("Competencia", fmt(s.proficiencyBonus))}
          {box("Perc. pasiva", s.passivePerception)}
        </section>

        <div className="ps-cols">
          <div className="ps-col">
            <section className="ps-card">
              <h2>Características</h2>
              {ABILITIES.map((a) => (
                <div className="ps-line" key={a}><span>{ABILITY_LABEL[a]}</span><b>{s.abilities[a].score} ({fmt(s.abilities[a].mod)})</b></div>
              ))}
            </section>
            <section className="ps-card">
              <h2>Salvaciones</h2>
              {ABILITIES.map((a) => (
                <div className="ps-line" key={a}><span>{ABILITY_LABEL[a]}</span><b>{fmt(s.saves[a])}</b></div>
              ))}
            </section>
          </div>

          <div className="ps-col">
            <section className="ps-card">
              <h2>Habilidades</h2>
              {Object.keys(SKILL_LABEL).map((sk) => (
                <div className="ps-line" key={sk}><span>{SKILL_LABEL[sk]}</span><b>{fmt(s.skills[sk] ?? 0)}</b></div>
              ))}
            </section>
          </div>

          <div className="ps-col">
            <section className="ps-card">
              <h2>Ataques</h2>
              {s.weapons.filter((w) => w.equipped).concat(s.weapons.filter((w) => !w.equipped)).map((w) => (
                <div className="ps-line" key={w.id}><span>{w.equipped ? "▪ " : ""}{w.name}</span><b>{w.damage ?? "—"}</b></div>
              ))}
              {s.weapons.length === 0 && <p className="ps-muted">—</p>}
            </section>
            {s.cantrips.length > 0 && (
              <section className="ps-card">
                <h2>Trucos</h2>
                {s.cantrips.map((c) => <div className="ps-line" key={c.name}><span>{c.name}</span><b>{c.damage ?? ""}</b></div>)}
              </section>
            )}
            {s.resistances && s.resistances.length > 0 && (
              <section className="ps-card"><h2>Resistencias</h2><p>{s.resistances.join(", ")}</p></section>
            )}
            {(s.languages?.length || s.tools?.length) && (
              <section className="ps-card">
                {s.languages?.length ? <p><b>Idiomas:</b> {s.languages.join(", ")}</p> : null}
                {s.tools?.length ? <p><b>Herramientas:</b> {s.tools.join(", ")}</p> : null}
              </section>
            )}
          </div>
        </div>

        {s.spellcasting && (
          <section className="ps-card ps-wide">
            <h2>Conjuros · CD {s.spellcasting.dc} · Ataque {fmt(s.spellcasting.attack)}</h2>
            <p className="ps-slots">
              {Object.entries(slots).map(([lvl, sl]) => <span key={lvl} className="ps-slot">Nv {lvl}: {sl.max - sl.used}/{sl.max}</span>)}
              {s.spellcasting.pactSlots && <span className="ps-slot">Pacto Nv {s.spellcasting.pactSlots.level}: {s.spellcasting.pactSlots.max - s.spellcasting.pactSlots.used}/{s.spellcasting.pactSlots.max}</span>}
            </p>
            {spellLevels.map((lvl) => (
              <p key={lvl} className="ps-spell-line"><b>{lvl === 0 ? "Trucos" : `Nv ${lvl}`}:</b> {spells.filter((sp) => sp.level === lvl).map((sp) => sp.name + (sp.prepared || sp.alwaysPrepared ? "*" : "")).join(", ")}</p>
            ))}
            <p className="ps-muted">* preparado</p>
          </section>
        )}

        {s.features.length > 0 && (
          <section className="ps-card ps-wide">
            <h2>Rasgos y dotes</h2>
            {s.features.map((f) => (
              <p key={`${f.name}-${f.source}`} className="ps-feat"><b>{f.name}</b> <span className="ps-muted">({f.source})</span>{f.description ? ` — ${f.description}` : ""}</p>
            ))}
          </section>
        )}

        {(currency.length > 0 || (s.personality && (s.personality.traits || s.personality.ideals || s.personality.bonds || s.personality.flaws)) || s.backstory) && (
          <section className="ps-card ps-wide">
            {currency.length > 0 && <p><b>Monedas:</b> {currency.map(([k, v]) => `${v} ${k}`).join(" · ")}</p>}
            {s.personality?.traits && <p><b>Rasgos:</b> {s.personality.traits}</p>}
            {s.personality?.ideals && <p><b>Ideales:</b> {s.personality.ideals}</p>}
            {s.personality?.bonds && <p><b>Vínculos:</b> {s.personality.bonds}</p>}
            {s.personality?.flaws && <p><b>Defectos:</b> {s.personality.flaws}</p>}
            {s.backstory && <p><b>Historia:</b> {s.backstory}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
