# CLAUDE.md — Proyecto: App independiente de D&D 2024

## Objetivo
Construir una **app independiente** (no un plugin de Claude) de gestión de D&D 2024: personajes, inventario, hechizos, combate, compañeros, dados y hoja personalizable, usable en computador, móvil y tablet.

Este repo ya contiene el **motor completo** funcionando. Tu trabajo es construir la app encima, no reescribir las reglas.

## Qué ya existe (NO reescribir)

El motor es agnóstico de UI y vive en `src/`:

- `src/types.ts` — modelo de dominio completo (Character, InventoryItem, Spellcasting, Companion, SheetStyle, ContentPack...).
- `src/rules.ts` — motor de reglas 2024: CA derivada de armadura equipada, salvaciones, skills con competencia/pericia, DC/impacto de conjuro, slots por multiclase (full/half/third caster + Pact Magic), hoja derivada (`computedSheet`), carga, tabla de slots.
- `src/dice.ts` — dados con `crypto.randomInt`, notación `NdM[kh/kl/dh/dlX][±mod]`, ventaja/desventaja, crítico/pifia.
- `src/store.ts` — persistencia JSON atómica en `DND_DATA_DIR` (default `~/.dnd-mcp`), siembra automática del pack SRD.
- `src/data/srd-core.json` — contenido SRD 5.2 (CC-BY-4.0): 12 clases, 10 especies, 4 trasfondos, 15 condiciones, armas con Mastery, armaduras, 18 hechizos. Extensible con content packs JSON.
- `src/tools/*.ts` — la lógica de flujo (crear personaje, subir nivel, equipar, lanzar hechizo, daño/concentración/death saves, descansos, compañeros). Estaba acoplada a MCP (`registerTool` + respuestas `ok/fail`), pero contiene TODAS las reglas de negocio validadas. **Se está extrayendo a `src/domain/` (funciones sin I/O sobre `db`/`character`) y estos tools se eliminan una vez migrados.**

`npm run build` compila limpio y copia `src/data/` a `dist/data/` (script cross-platform `scripts/copy-assets.mjs`).

> **Decisión (2026-07-06): app independiente, sin MCP.** El servidor MCP se elimina; el proyecto es solo la app (API REST + SPA). La capa de dominio es la única fuente de verdad y la consume la API. No reintroducir el MCP salvo indicación expresa.

## Qué construir

1. **Refactor**: extraer la lógica de `src/tools/*.ts` a `src/domain/*.ts` (funciones que reciben `db`/`character`, mutan y devuelven resultado o lanzan `DomainError`), con tests vitest. Luego borrar `src/tools/`, `src/helpers.ts` y reescribir `src/index.ts` como servidor Express (sin MCP).
2. **API HTTP propia** (Express o Fastify, ya hay Express): REST/JSON sobre la capa de dominio. Endpoints por recurso: `/characters`, `/characters/:id/inventory`, `/spells`, `/combat`, `/companions`, `/roll`, `/content`. Websocket o SSE opcional para sincronizar la hoja en vivo entre dispositivos.
3. **Frontend**: SPA responsive (React + Vite recomendado) que funcione bien en desktop, tablet y móvil:
   - Hoja de personaje interactiva que renderiza `computedSheet` y respeta `SheetStyle` (theme, accentColor, fontFamily, layout, retrato, customCss, tokens).
   - Panel de combate: PG/temp, condiciones con su resumen de reglas, efectos con contador de rondas, concentración, death saves, descansos.
   - Inventario con drag/equipar, monedas, sintonización (máx 3), peso/carga.
   - Grimorio: aprender/preparar/lanzar con slots visibles, upcasting, rituales.
   - Compañeros con sus tarjetas propias.
   - Bandeja de dados con historial y animación simple.
   - Wizard de creación de personaje y de subida de nivel guiado por el contenido instalado.
   - Import/export de personajes y de content packs.
4. **Empaquetado multiplataforma**: la SPA servida por el mismo backend (una sola URL usable desde cualquier dispositivo). PWA (manifest + service worker) para instalarla en móvil/tablet. Escritorio opcional después (Tauri/Electron), no prioritario.

## Reglas del proyecto

- TypeScript estricto, sin `any`. ESM (`type: module`, imports con `.js`).
- Las reglas de juego viven SOLO en la capa de dominio; la UI nunca calcula CA, slots ni bonos.
- Todo contenido de juego sale del store de content packs, nunca hardcodeado en la UI (así el contenido futuro entra solo con packs).
- **Biblioteca de contenido ILIMITADA y actualizable:** sin tope de packs, entradas ni tipos. Actualizar contenido = reimportar un pack con el mismo id. Cualquier material (homebrew, de terceros, futuras publicaciones) entra por packs sin tocar código.
- **Copyright:** el repo solo redistribuye el **SRD 5.2** (CC-BY-4.0); NO empaquetar el PHB/MM/DMG 2024 completos ni contenido con copyright de WotC más allá del SRD. El usuario carga por su cuenta el material que posea. Mantener la atribución CC-BY-4.0 visible.
- Mantener compatibilidad del formato de datos en `characters.json` y de los content packs.
- Tests: unit para dominio (vitest), smoke para la API.

## Comandos
- `npm run build` — compila TS y copia `src/data/` a `dist/data/`.
- `npm test` — tests de dominio (vitest). `npm run test:watch` en watch.
- `npm start` — servidor de la app (API REST + SPA). `PORT=3000` configurable.
- Datos en `DND_DATA_DIR` (default `~/.dnd-mcp`).

## Orden sugerido de trabajo
1. Refactor a `src/domain/` con tests.
2. API REST + servir estáticos.
3. Frontend: hoja de personaje → combate → hechizos → inventario → compañeros → dados → wizards → personalización visual.
4. PWA + pulido responsive.
