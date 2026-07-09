import { useState } from "react";
import { CharacterLibrary } from "./CharacterLibrary";
import { CharacterView } from "./CharacterView";
import { ContentBrowser } from "./ContentBrowser";

type View = { name: "library" } | { name: "sheet"; id: string } | { name: "content" };

export function App() {
  const [view, setView] = useState<View>({ name: "library" });

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: "library" })}>
          ⚔️ D&amp;D 2024
        </button>
        <span className="topbar-sub">SRD 5.2 · app independiente</span>
        <div className="spacer" />
        <button className={`tab${view.name === "library" ? " active" : ""}`} onClick={() => setView({ name: "library" })}>Personajes</button>
        <button className={`tab${view.name === "content" ? " active" : ""}`} onClick={() => setView({ name: "content" })}>Contenido</button>
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
