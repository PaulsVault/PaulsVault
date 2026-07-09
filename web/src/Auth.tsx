import { useState } from "react";
import { api, type AuthUser } from "./api";
import { DragonArt } from "./DragonArt";

export function Auth({ onAuthed }: { onAuthed: (u: AuthUser) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const { user } = mode === "login" ? await api.login(email, password) : await api.register(email, password);
      onAuthed(user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <DragonArt />
        <h1 className="auth-brand">⚔️ D&amp;D 2024</h1>
        <p className="auth-tagline">
          {mode === "login" ? "Inicia sesión para ver tus personajes" : "Forja tu leyenda — crea tu cuenta"}
        </p>
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com" />
          </label>
          <label className="field"><span>Contraseña {mode === "register" && <em className="muted small">(mín. 8)</em>}</span>
            <input type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </label>
          {error && <p className="error">⚠️ {error}</p>}
          <button className="btn primary" type="submit" disabled={busy || !email || password.length < 8}>
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
