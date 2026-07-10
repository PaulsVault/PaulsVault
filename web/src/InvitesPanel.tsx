import { useEffect, useState } from "react";
import { api, type Invite } from "./api";

export function InvitesPanel({ onBack }: { onBack: () => void }) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [label, setLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function load() { setInvites(await api.listInvites()); }
  useEffect(() => { void load().catch((e) => setNote("⚠️ " + (e as Error).message)); }, []);

  const copy = async (url: string) => { try { await navigator.clipboard.writeText(url); setNote("Enlace copiado al portapapeles."); } catch { setNote(url); } };

  async function create() {
    setBusy(true); setNote(null);
    try {
      const inv = await api.createInvite({ label: label.trim() || undefined, expiresInDays: expires ? Number(expires) : undefined });
      setLabel(""); setExpires("");
      await load();
      await copy(inv.url);
      setNote(`Enlace creado y copiado: ${inv.url}`);
    } catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  async function revoke(id: string) {
    setBusy(true); setNote(null);
    try { await api.deleteInvite(id); await load(); }
    catch (e) { setNote("⚠️ " + (e as Error).message); }
    finally { setBusy(false); }
  }

  const status = (inv: Invite) =>
    inv.used ? <span className="chip">usada</span>
      : inv.expiresAt && Date.parse(inv.expiresAt) < Date.now() ? <span className="chip danger">expirada</span>
      : <span className="chip inspire">activa</span>;

  return (
    <section className="create">
      <div className="library-head"><h1>Invitaciones</h1><button className="btn" onClick={onBack}>← Volver</button></div>
      {note && <p className="note">{note}</p>}

      <section className="panel">
        <h2>Nueva invitación</h2>
        <p className="muted small">Genera un enlace de <b>un solo uso</b>. Compártelo solo con tu mesa: el registro está cerrado, nadie puede crear cuenta sin invitación.</p>
        <div className="row wrap">
          <input placeholder="Etiqueta (p.ej. nombre del jugador)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <input type="number" min={1} placeholder="Expira en (días, opcional)" value={expires} onChange={(e) => setExpires(e.target.value)} style={{ maxWidth: 220 }} />
          <button className="btn primary" disabled={busy} onClick={create}>+ Crear enlace</button>
        </div>
      </section>

      <section className="panel">
        <h2>Enlaces ({invites.length})</h2>
        {invites.length === 0 && <p className="muted small">Aún no has creado invitaciones.</p>}
        <ul className="line-list">
          {invites.map((inv) => (
            <li key={inv.id} style={{ display: "block" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <b>{inv.label ?? "Invitación"}</b> {status(inv)}
                  <div className="muted small invite-url">{inv.url}</div>
                  {inv.expiresAt && !inv.used && <div className="muted small">Expira: {new Date(inv.expiresAt).toLocaleDateString()}</div>}
                </div>
                <div className="row">
                  {!inv.used && <button className="btn small" disabled={busy} onClick={() => copy(inv.url)}>Copiar</button>}
                  {!inv.used && <button className="icon-btn" title="Revocar" disabled={busy} onClick={() => revoke(inv.id)}>🗑</button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
