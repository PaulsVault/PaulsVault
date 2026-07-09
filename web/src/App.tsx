import { useEffect, useState } from "react";
import { api, type AuthUser } from "./api";
import { Auth } from "./Auth";
import { CharacterLibrary } from "./CharacterLibrary";
import { CharacterView } from "./CharacterView";
import { ContentBrowser } from "./ContentBrowser";

type View = { name: "library" } | { name: "sheet"; id: string } | { name: "content" };

export function App() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined); // undefined = cargando
  const [view, setView] = useState<View>({ name: "library" });

  useEffect(() => {
    api.me().then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
    setView({ name: "library" });
  }

  if (user === undefined) return <div className="app"><main className="content"><p className="muted">Cargando…</p></main></div>;
  if (user === null) return <Auth onAuthed={(u) => setUser(u)} />;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: "library" })}>⚔️ D&amp;D 2024</button>
        <div className="spacer" />
        <button className={`tab${view.name === "library" ? " active" : ""}`} onClick={() => setView({ name: "library" })}>Personajes</button>
        <button className={`tab${view.name === "content" ? " active" : ""}`} onClick={() => setView({ name: "content" })}>Contenido</button>
        <span className="topbar-user">{user.email}</span>
        <button className="btn small" onClick={logout}>Salir</button>
      </header>

      <main className="content">
        {view.name === "library" && <CharacterLibrary onOpen={(id) => setView({ name: "sheet", id })} />}
        {view.name === "sheet" && <CharacterView id={view.id} onBack={() => setView({ name: "library" })} />}
        {view.name === "content" && <ContentBrowser onBack={() => setView({ name: "library" })} />}
      </main>

      <footer className="footer">
        Contenido del System Reference Document 5.2.1 · © Wizards of the Coast · CC-BY-4.0
      </footer>
    </div>
  );
}
