import { useState } from "react";
import { api, type AuthUser } from "./api";
import { DragonArt } from "./DragonArt";
import { ThemeToggle } from "./ThemeToggle";

export function Auth({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const urlInvite = new URLSearchParams(window.location.search).get("invite") ?? "";
  const [mode, setMode] = useState<"login" | "register">(urlInvite ? "register" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState(urlInvite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { user } = mode === "login" ? await api.login(email, password) : await api.register(email, password, invite.trim());
      onAuthed(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-theme-toggle"><ThemeToggle /></div>
      <div className="auth-card">
        {imgFailed ? <DragonArt /> : (
          <div className="dragon-scene">
            <img className="dragon-img" src="/bahamut.png" alt="Dragón platino" onError={() => setImgFailed(true)} />
          </div>
        )}
        <h1 className="auth-brand">⚔️ D&amp;D 2024</h1>
        <p className="auth-tagline">
          {mode === "login" ? "Inicia sesión para ver tus personajes" : "Registro solo por invitación — crea tu cuenta"}
        </p>
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
          </label>
          <label className="field"><span>Contraseña {mode === "register" && <em className="muted small">(mín. 8)</em>}</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          {mode === "register" && (
            <label className="field"><span>Código de invitación</span>
              <input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Abre tu enlace de invitación o pega el código" required />
            </label>
          )}
          {error && <p className="error">⚠️ {error}</p>}
          <button className="btn primary" type="submit" disabled={busy || !email || password.length < 8 || (mode === "register" && !invite.trim())}>
            {busy ? "…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>
        <button className="link-btn" onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}>
          {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
      </div>
    </div>
  );
}
