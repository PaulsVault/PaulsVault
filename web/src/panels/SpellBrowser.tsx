import { useEffect, useMemo, useState } from "react";
import { api, type SpellCard } from "../api";

const SCHOOL_LABEL: Record<string, string> = {
  Abjuration: "Abjuración", Conjuration: "Conjuración", Divination: "Adivinación", Enchantment: "Encantamiento",
  Evocation: "Evocación", Illusion: "Ilusión", Necromancy: "Nigromancia", Transmutation: "Transmutación",
};
const lvlLabel = (n: number) => (n === 0 ? "Trucos" : `Nivel ${n}`);

export function SpellBrowser({ myClasses, known, busy, onLearn }: {
  myClasses: string[];
  known: Set<string>;
  busy: boolean;
  onLearn: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"class" | "all">("class");
  const [catalog, setCatalog] = useState<SpellCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<"all" | number>("all");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const load = scope === "all" || myClasses.length === 0
      ? api.spellCatalog()
      : Promise.all(myClasses.map((c) => api.spellCatalog(c))).then((lists) => {
          const seen = new Set<string>(); const merged: SpellCard[] = [];
          for (const l of lists) for (const s of l) if (!seen.has(s.name)) { seen.add(s.name); merged.push(s); }
          return merged;
        });
    load.then(setCatalog).catch(() => setCatalog([])).finally(() => setLoading(false));
  }, [open, scope, myClasses.join(",")]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((s) =>
      (level === "all" || s.level === level) &&
      (!q || s.name.toLowerCase().includes(q) || s.summary.toLowerCase().includes(q)));
  }, [catalog, level, query]);

  // Agrupa por nivel de conjuro (0..9).
  const byLevel = useMemo(() => {
    const map = new Map<number, SpellCard[]>();
    for (const s of filtered) { const a = map.get(s.level) ?? []; a.push(s); map.set(s.level, a); }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  return (
    <section className={`panel${open ? " open" : ""}`}>
      <div className="collapse-h" onClick={() => setOpen(!open)}>
        <h2 style={{ margin: 0 }}>📖 Explorar conjuros</h2>
        <span className="muted">{open ? "▲" : "▼"}</span>
      </div>
      {!open && <p className="muted small">Lista navegable por nivel y escuela para ver descripciones y decidir qué aprender.</p>}

      {open && (
        <>
          <div className="row wrap" style={{ margin: "8px 0" }}>
            <div className="tabs mini">
              <button className={`tab${scope === "class" ? " active" : ""}`} onClick={() => setScope("class")} disabled={myClasses.length === 0}>De mi clase</button>
              <button className={`tab${scope === "all" ? " active" : ""}`} onClick={() => setScope("all")}>Todas</button>
            </div>
            <select value={String(level)} onChange={(e) => setLevel(e.target.value === "all" ? "all" : Number(e.target.value))} style={{ maxWidth: 150 }}>
              <option value="all">Todos los niveles</option>
              {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{lvlLabel(i)}</option>)}
            </select>
            <input placeholder="Filtrar por nombre o texto…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
          </div>

          {loading ? <p className="muted small">Cargando conjuros…</p> : filtered.length === 0 ? (
            <p className="muted small">Sin conjuros para este filtro.</p>
          ) : (
            <div className="stack" style={{ gap: 12 }}>
              {byLevel.map(([lvl, spells]) => (
                <div key={lvl}>
                  <h3 className="inv-group-head">{lvlLabel(lvl)} · {spells.length}</h3>
                  <ul className="spell-list">
                    {spells.map((s) => {
                      const isKnown = known.has(s.name.toLowerCase());
                      const isOpen = expanded === s.name;
                      return (
                        <li key={s.name} className="spell-row">
                          <div className="spell-head" style={{ cursor: "pointer" }} onClick={() => setExpanded(isOpen ? null : s.name)}>
                            <b>{s.name} <span className="muted small">{isOpen ? "▲" : "▼"}</span></b>
                            <span className="muted small">
                              {SCHOOL_LABEL[s.school] ?? s.school}
                              {s.concentration ? " · 🌀 concentración" : ""}{s.ritual ? " · 📿 ritual" : ""}
                              {scope === "all" && s.classes.length ? ` · ${s.classes.join(", ")}` : ""}
                            </span>
                            {isOpen && s.summary && <p className="spell-desc">{s.summary}</p>}
                          </div>
                          <button className="btn small" disabled={busy || isKnown} onClick={() => onLearn(s.name)}>
                            {isKnown ? "✓ ya lo tienes" : "+ Aprender"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
