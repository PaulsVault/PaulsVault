import { useEffect, useState } from "react";
import { api } from "./api";
import { ABILITIES, ABILITY_LABEL, type AbilityKey, type Sheet } from "./types";

const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const SKILL_LABEL: Record<string, string> = {
  acrobatics: "Acrobacias", "animal handling": "T. con Animales", arcana: "Arcanos", athletics: "Atletismo",
  deception: "Engaño", history: "Historia", insight: "Perspicacia", intimidation: "Intimidación",
  investigation: "Investigación", medicine: "Medicina", nature: "Naturaleza", perception: "Percepción",
  performance: "Interpretación", persuasion: "Persuasión", religion: "Religión", "sleight of hand": "Juego de Manos",
  stealth: "Sigilo", survival: "Supervivencia",
};
// Habilidades agrupadas por característica (disposición de la hoja oficial 2024).
const SKILLS_BY_ABILITY: Record<AbilityKey, string[]> = {
  str: ["athletics"],
  dex: ["acrobatics", "sleight of hand", "stealth"],
  con: [],
  int: ["arcana", "history", "investigation", "nature", "religion"],
  wis: ["animal handling", "insight", "medicine", "perception", "survival"],
  cha: ["deception", "intimidation", "performance", "persuasion"],
};
const ABILITY_FULL: Record<AbilityKey, string> = { str: "Fuerza", dex: "Destreza", con: "Constitución", int: "Inteligencia", wis: "Sabiduría", cha: "Carisma" };
interface KnownSpell { name: string; level: number; prepared: boolean; alwaysPrepared?: boolean; concentration?: boolean; ritual?: boolean }
interface InvItem { id: string; name: string; qty: number; type: string; equipped: boolean; attuned: boolean; requiresAttunement?: boolean }

/** Hoja imprimible con la disposición de la hoja oficial de D&D 2024 (2 páginas). "Guardar como PDF" desde el navegador. */
export function PrintSheet({ id, sheet: s, onClose }: { id: string; sheet: Sheet; onClose: () => void }) {
  const [spells, setSpells] = useState<KnownSpell[]>([]);
  const [inv, setInv] = useState<InvItem[]>([]);
  useEffect(() => {
    if (s.spellcasting) void api.getSpells(id).then((v) => setSpells(((v as { spells?: KnownSpell[] }).spells) ?? [])).catch(() => setSpells([]));
    void api.getInventory(id).then((v) => setInv(((v as { inventory?: InvItem[] }).inventory) ?? [])).catch(() => setInv([]));
  }, [id, s.spellcasting]);

  const dot = (on: boolean) => <span className={`ps-dot${on ? " on" : ""}`} />;
  const box = (label: string, value: string | number, sub?: string) => (
    <div className="ps-topbox"><span className="ps-topbox-l">{label}</span><b className="ps-topbox-v">{value}</b>{sub && <span className="ps-topbox-s">{sub}</span>}</div>
  );
  const slots = s.spellcasting?.slots ?? {};
  const spellLevels = [...new Set(spells.map((sp) => sp.level))].sort((a, b) => a - b);
  const coins = Object.entries(s.currency ?? {});
  const attuned = inv.filter((i) => i.attuned);

  return (
    <div className="print-root">
      <div className="no-print ps-toolbar">
        <button className="btn primary" onClick={() => window.print()}>🖨️ Imprimir / Guardar PDF</button>
        <button className="btn" onClick={onClose}>Cerrar</button>
        <span className="muted small">En el diálogo de impresión elige «Guardar como PDF» como destino y tamaño Carta/A4.</span>
      </div>

      {/* ══════════ PÁGINA 1 ══════════ */}
      <div className="ps-page">
        <header className="ps-head">
          <div className="ps-name"><h1>{s.name}</h1>
            <p>{s.classList.map((c) => `${c.name}${c.subclass ? ` (${c.subclass})` : ""} ${c.level}`).join(" / ")} · {s.species} · {s.background}{s.alignment ? ` · ${s.alignment}` : ""}</p>
          </div>
          <div className="ps-topboxes">
            {box("CA", s.ac)}
            {box("Puntos de golpe", `${s.hp.current}/${s.hp.max}`, s.hp.temp ? `Temp ${s.hp.temp}` : "Temp —")}
            {box("Salvaciones de muerte", "○○○", "Éxitos / Fallos")}
          </div>
        </header>

        <section className="ps-topline">
          {box("Comp.", fmt(s.proficiencyBonus))}
          {box("Iniciativa", fmt(s.initiative))}
          {box("Velocidad", `${s.speed} ft`)}
          {box("Tamaño", s.size ?? "—")}
          {box("Perc. pasiva", s.passivePerception)}
        </section>

        <div className="ps-body">
          {/* Columna de características + habilidades */}
          <div className="ps-abilities">
            {ABILITIES.map((a) => {
              const saveProf = s.saves[a] > s.abilities[a].mod;
              return (
                <section className="ps-abil" key={a}>
                  <div className="ps-abil-head">
                    <span className="ps-abil-name">{ABILITY_FULL[a]}</span>
                    <b className="ps-abil-mod">{fmt(s.abilities[a].mod)}</b>
                    <span className="ps-abil-score">{s.abilities[a].score}</span>
                  </div>
                  <div className="ps-abil-save">{dot(saveProf)} Salvación <b>{fmt(s.saves[a])}</b></div>
                  {SKILLS_BY_ABILITY[a].map((sk) => {
                    const bonus = s.skills[sk] ?? 0;
                    return <div className="ps-skill" key={sk}>{dot(bonus > s.abilities[a].mod)} <span>{SKILL_LABEL[sk]}</span><b>{fmt(bonus)}</b></div>;
                  })}
                </section>
              );
            })}
          </div>

          {/* Columna derecha: ataques, rasgos, competencias */}
          <div className="ps-right">
            <section className="ps-card">
              <h2>Armas y daño</h2>
              <table className="ps-table"><thead><tr><th>Arma</th><th>Daño</th></tr></thead><tbody>
                {s.weapons.filter((w) => w.equipped).concat(s.weapons.filter((w) => !w.equipped)).map((w) => (
                  <tr key={w.id}><td>{w.equipped ? "▪ " : ""}{w.name}</td><td>{w.damage ?? "—"}</td></tr>
                ))}
                {s.weapons.length === 0 && <tr><td colSpan={2} className="ps-muted">—</td></tr>}
              </tbody></table>
            </section>

            {s.cantrips.length > 0 && (
              <section className="ps-card"><h2>Trucos</h2>
                <p className="ps-inline">{s.cantrips.map((c) => `${c.name}${c.damage ? ` (${c.damage})` : ""}`).join(" · ")}</p>
              </section>
            )}

            {s.weaponMastery && s.weaponMastery.max > 0 && (
              <section className="ps-card"><h2>Maestrías de arma</h2>
                <p className="ps-inline">{s.weaponMastery.chosen.map((m) => `${m.weapon} (${m.mastery})`).join(" · ") || `Elige ${s.weaponMastery.max}`}</p>
              </section>
            )}

            <section className="ps-card"><h2>Rasgos de clase, especie y dotes</h2>
              {s.features.map((f) => <p className="ps-feat" key={`${f.name}-${f.source}`}><b>{f.name}</b> <span className="ps-muted">· {f.source}</span></p>)}
              {s.speciesTraits.map((t, i) => <p className="ps-feat" key={i}>{t}</p>)}
              {s.features.length === 0 && s.speciesTraits.length === 0 && <p className="ps-muted">—</p>}
            </section>

            <section className="ps-card"><h2>Entrenamiento y competencias</h2>
              <p><b>Armadura:</b> {s.armorProficiencies?.length ? s.armorProficiencies.join(", ") : "—"}</p>
              <p><b>Armas:</b> {s.weaponProficiencies?.length ? s.weaponProficiencies.join(", ") : "—"}</p>
              <p><b>Herramientas:</b> {s.tools?.length ? s.tools.join(", ") : "—"}</p>
              {s.resistances && s.resistances.length > 0 && <p><b>Resistencias:</b> {s.resistances.join(", ")}</p>}
              <p><b>Inspiración heroica:</b> {s.inspiration ? "Sí ✦" : "No"}</p>
            </section>
          </div>
        </div>
      </div>

      {/* ══════════ PÁGINA 2 ══════════ */}
      <div className="ps-page ps-page2">
        {s.spellcasting && (
          <section className="ps-card">
            <h2>Lanzamiento de conjuros{s.spellcasting.ability ? ` · ${ABILITY_LABEL[s.spellcasting.ability as AbilityKey] ?? s.spellcasting.ability}` : ""}</h2>
            <div className="ps-spellhead">
              <div className="ps-topbox"><span className="ps-topbox-l">CD de salvación</span><b className="ps-topbox-v">{s.spellcasting.dc}</b></div>
              <div className="ps-topbox"><span className="ps-topbox-l">Bono de ataque</span><b className="ps-topbox-v">{fmt(s.spellcasting.attack)}</b></div>
              <div className="ps-slots">
                {Object.entries(slots).map(([lvl, sl]) => <span key={lvl} className="ps-slot">Nv {lvl}: <b>{sl.max - sl.used}</b>/{sl.max}</span>)}
                {s.spellcasting.pactSlots && <span className="ps-slot">Pacto (Nv {s.spellcasting.pactSlots.level}): <b>{s.spellcasting.pactSlots.max - s.spellcasting.pactSlots.used}</b>/{s.spellcasting.pactSlots.max}</span>}
                {Object.keys(slots).length === 0 && !s.spellcasting.pactSlots && <span className="ps-muted">Sin espacios de conjuro.</span>}
              </div>
            </div>
            <h3 className="ps-sub2">Trucos y conjuros preparados</h3>
            {spellLevels.map((lvl) => (
              <p key={lvl} className="ps-spell-line"><b>{lvl === 0 ? "Trucos" : `Nivel ${lvl}`}:</b> {spells.filter((sp) => sp.level === lvl).map((sp) => sp.name + (sp.prepared || sp.alwaysPrepared ? "✦" : "") + (sp.concentration ? " ©" : "")).join(", ")}</p>
            ))}
            {spells.length === 0 && <p className="ps-muted">Ninguno conocido todavía.</p>}
            <p className="ps-muted">✦ preparado · © concentración</p>
          </section>
        )}

        <section className="ps-card"><h2>Equipo</h2>
          <p className="ps-inline">{inv.map((i) => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ""}${i.equipped ? " (equipado)" : ""}${i.attuned ? " ✧" : ""}`).join(" · ") || "—"}</p>
          {attuned.length > 0 && <p><b>Sintonización (✧):</b> {attuned.map((i) => i.name).join(", ")} ({attuned.length}/3)</p>}
          {coins.some(([, v]) => v > 0) && <p><b>Monedas:</b> {coins.filter(([, v]) => v > 0).map(([k, v]) => `${v} ${k}`).join(" · ")}</p>}
        </section>

        <section className="ps-card"><h2>Idiomas</h2>
          <p className="ps-inline">{s.languages?.length ? s.languages.join(", ") : "—"}</p>
        </section>

        <section className="ps-card"><h2>Historia y personalidad</h2>
          {s.appearance && <p><b>Apariencia:</b> {s.appearance}</p>}
          {s.personality?.traits && <p><b>Rasgos:</b> {s.personality.traits}</p>}
          {s.personality?.ideals && <p><b>Ideales:</b> {s.personality.ideals}</p>}
          {s.personality?.bonds && <p><b>Vínculos:</b> {s.personality.bonds}</p>}
          {s.personality?.flaws && <p><b>Defectos:</b> {s.personality.flaws}</p>}
          {s.backstory && <p><b>Historia:</b> {s.backstory}</p>}
          {!s.appearance && !s.backstory && !s.personality?.traits && <p className="ps-muted">—</p>}
        </section>
      </div>
    </div>
  );
}
