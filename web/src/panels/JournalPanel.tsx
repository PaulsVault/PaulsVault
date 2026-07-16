import { useState } from "react";
import { api } from "../api";
import type { Sheet } from "../types";

export function JournalPanel({ id, sheet: s, reload }: { id: string; sheet: Sheet; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [jDate, setJDate] = useState(new Date().toISOString().slice(0, 10));
  const [jTitle, setJTitle] = useState("");
  const [jCampaign, setJCampaign] = useState("");
  const [jBody, setJBody] = useState("");

  async function run(fn: () => Promise<unknown>, msg?: string) {
    setBusy(true); setNote(null);
    try { await fn(); await reload(); if (msg) setNote(msg); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  const addEntry = () => {
    if (!jBody.trim()) return;
    return run(async () => {
      await api.addJournal(id, { date: jDate, title: jTitle, campaign: jCampaign, body: jBody });
      setJTitle(""); setJCampaign(""); setJBody("");
    }, "Entrada añadida al diario");
  };

  return (
    <div className="stack">
      {note && <p className="note">{note}</p>}

      <section className="panel">
        <h2>Diario de campaña y sesiones</h2>
        <p className="muted small">Registra por fecha lo que ocurre para trackear la historia del personaje.</p>
        <div className="form">
          <label className="field"><span>Fecha de sesión</span><input type="date" value={jDate} onChange={(e) => setJDate(e.target.value)} /></label>
          <label className="field"><span>Campaña</span><input value={jCampaign} onChange={(e) => setJCampaign(e.target.value)} placeholder="Nombre de la campaña" /></label>
          <label className="field span2"><span>Título</span><input value={jTitle} onChange={(e) => setJTitle(e.target.value)} placeholder="p.ej. La cripta de Nerull" /></label>
          <label className="field span2"><span>Qué pasó</span><textarea rows={4} value={jBody} onChange={(e) => setJBody(e.target.value)} placeholder="Resumen de la sesión…" /></label>
          <div className="span2 form-actions"><button className="btn primary" disabled={busy || !jBody.trim()} onClick={addEntry}>+ Añadir entrada</button></div>
        </div>

        {s.journal.length === 0 ? (
          <p className="muted small">Aún no hay entradas.</p>
        ) : (
          <ol className="journal">
            {s.journal.map((j) => (
              <li key={j.id} className="journal-entry">
                <div className="journal-head">
                  <span className="journal-date">📅 {j.date}</span>
                  {j.campaign && <span className="chip">{j.campaign}</span>}
                  {j.title && <b className="journal-title">{j.title}</b>}
                  <span className="spacer" />
                  <button className="icon-btn" title="Borrar entrada" disabled={busy} onClick={() => run(() => api.deleteJournal(id, j.id))}>🗑</button>
                </div>
                <p className="journal-body">{j.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
