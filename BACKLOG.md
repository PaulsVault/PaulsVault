# Backlog — App independiente de D&D 2024

Traducción del [`PRD.md`](./PRD.md) a épicas y tickets accionables. Cada ticket lista su criterio de aceptación clave (AC), prioridad, fase y dependencias.

**Prioridad:** `P0` bloqueante · `P1` core v1 · `P2` deseable v1 · `P3` post-v1.
**Fase:** `F1` dominio · `F2` API+estáticos · `F3` frontend · `F4` PWA/pulido.
**Convención de tests:** dominio con **vitest**; API con **smoke tests**. Regla de oro: las reglas de juego viven solo en `src/domain/`; ni API ni UI calculan.

---

## E0 · Fundaciones del entorno  · P0 · F1
Desbloquear build, test y ejecución.

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-0.1 | Instalar Node LTS + dependencias | `npm ci` sin errores; `npm run build` compila limpio; MCP arranca (stdio y `TRANSPORT=http`). | P0 | F1 | — |
| DND-0.2 | Build cross-platform | Reemplazar `mkdir -p`/`cp` del script `build` por solución node (`shx`/`cpy`/script) que copie `src/data/` → `dist/data/` en Windows y POSIX, sin cambiar la salida. | P0 | F1 | 0.1 |
| DND-0.3 | Configurar vitest | `npm test` corre; test dummy verde; script `test` y `test:watch` en `package.json`. | P0 | F1 | 0.1 |

---

## E1 · Capa de dominio (refactor)  · P0 · F1
Extraer la lógica de `src/tools/*.ts` a `src/domain/*.ts` como funciones que reciben `db`/`character`, mutan y devuelven resultado o lanzan error. **Sin cambiar comportamiento.**

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-1.1 | Contrato de dominio | Definir firma `(db\|character, input) => result`, clase `DomainError` (con código→HTTP), y tipos de entrada/salida por operación. Documentado en `src/domain/README` o comentarios. | P0 | F1 | 0.3 |
| DND-1.2 | Dominio: personajes | `create/list/get/update/levelUp/delete/export/import` en `domain/characters.ts`. Tests: PG=máx dado+CON y promedio por nivel; ASI≤20; multiclase añade clase nivel 1; import genera id nuevo + renombra colisión. | P0 | F1 | 1.1 |
| DND-1.3 | Dominio: inventario + dinero | `domain/inventory.ts`. Tests: equipar armadura/escudo recalcula CA y desequipa la anterior; attunement máx 3; contenedores; carga=FUE×15; moneda no queda negativa. | P0 | F1 | 1.1 |
| DND-1.4 | Dominio: hechizos + slots | `domain/spells.ts`. Tests: upcasting validado (slot ≥ nivel); slot de pacto vs normal vs `no_slot`; concentración nueva rompe la anterior y crea efecto; no despreparar "siempre preparado"; `set_max/spend/recover/recover_all`. | P0 | F1 | 1.1 |
| DND-1.5 | Dominio: combate | `domain/combat.ts` (hp/death/conditions/effects/rest). Tests: temp HP absorbe primero; daño masivo (exceso ≥ máx) = muerte; 0 PG→Unconscious+rompe conc.; death saves (crítico revive, fumble=2); `tick` expira a 0; descanso corto (dados+CON) y largo (recupera mitad dados, todo slot, baja Exhaustion, limpia efectos). | P0 | F1 | 1.1 |
| DND-1.6 | Dominio: compañeros | `domain/companions.ts` (create/update/delete/list/damage/heal). Tests: borrar compañero elimina sus efectos; daño usa temp primero. | P0 | F1 | 1.1 |
| DND-1.7 | Dominio: dados + pruebas | `domain/checks.ts` sobre `dice.ts`. Tests: ataque usa finesse/ammunition/bono mágico+competencia; daño duplica dados en crítico; ventaja/desventaja d20. | P0 | F1 | 1.1 |
| DND-1.8 | Dominio: estilo + contenido | `domain/style.ts` y `domain/content.ts` (search/get/import/list/delete packs; `findEntry`). Tests: búsqueda por tipo/nivel/clase; update de pack por id. | P0 | F1 | 1.1 |
| DND-1.9 | MCP como wrappers finos | Reescribir `src/tools/*.ts` para llamar al dominio y solo formatear `ok/fail`. AC: paridad de comportamiento verificada (mismas respuestas que antes en un set de regresión); `build` limpio. | P0 | F1 | 1.2–1.8 |

---

## E2 · API REST + estáticos  · P0 · F2
REST/JSON sobre el dominio; servir la SPA desde el mismo backend.

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-2.1 | Bootstrap API | App Express con `express.json`, router `/api`, middleware de error `DomainError→{400,404,409,422}`, `/api/health`. | P0 | F2 | E1 |
| DND-2.2 | Endpoints personajes | CRUD + `level-up` + `export`/`import` según §6 del PRD. Smoke test por ruta. | P0 | F2 | 2.1 |
| DND-2.3 | Endpoints inventario/dinero | `inventory` (add/equip/attune/update/remove) + `currency`. | P0 | F2 | 2.1 |
| DND-2.4 | Endpoints hechizos/slots | `spells`, `spells/cast`, `spell-slots`. | P0 | F2 | 2.1 |
| DND-2.5 | Endpoints combate | `hp`, `conditions`, `effects`, `rest`. | P0 | F2 | 2.1 |
| DND-2.6 | Endpoints compañeros | CRUD + damage/heal. | P1 | F2 | 2.1 |
| DND-2.7 | Endpoints dados/pruebas | `POST /api/roll`, `POST /api/characters/:id/check`. | P0 | F2 | 2.1 |
| DND-2.8 | Endpoint estilo | `PATCH /api/characters/:id/style`. | P1 | F2 | 2.1 |
| DND-2.9 | Endpoints contenido/packs | `content` search/get; `content-packs` list/import/delete. | P0 | F2 | 2.1 |
| DND-2.10 | Servir SPA estática | Backend sirve `dist` del frontend con fallback SPA (`index.html`) para rutas cliente. | P0 | F2 | 2.1 |
| DND-2.11 | Smoke tests de API | Suite que arranca la app y golpea rutas críticas (crear→leer→dañar→descansar). | P1 | F2 | 2.2–2.9 |
| DND-2.12 | SSE de sincronización | `GET /api/characters/:id/stream` emite cambios de la hoja en vivo. | P2 | F2 | 2.2 |

---

## E3 · Frontend base + Hoja  · P1 · F3
Scaffold y hoja de personaje.

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-3.1 | Scaffold React+Vite+TS | Proyecto SPA con router, cliente API tipado (tipos compartidos con `types.ts`), estado global. `npm run dev` levanta. | P1 | F3 | E2 |
| DND-3.2 | Biblioteca de personajes (base) | Grid de tarjetas (retrato, clase/nivel, PG) desde `GET /api/characters`; abrir hoja; crear/importar. | P1 | F3 | 3.1 |
| DND-3.3 | Hoja de personaje | Render de `computedSheet` (características+mods, salvaciones, skills, CA+fórmula, iniciativa, velocidad, percepción pasiva, PG, dados, inspiración). **La UI no calcula.** | P1 | F3 | 3.1 |
| DND-3.4 | Aplicar `SheetStyle` | Tema/color/tipografía/layout/retrato/`tokens`; `customCss` **saneado/sandbox**. | P2 | F3 | 3.3 |

---

## E4 · Combate  · P1 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-4.1 | PG y daño/curación | Controles rápidos de daño/curación/temp; refleja Unconscious, muerte masiva y aviso de salvación de concentración. | P1 | F3 | 3.3, 2.5 |
| DND-4.2 | Death saves | Círculos de éxito/fallo; estabilizar/reset; crítico revive. | P1 | F3 | 2.5 |
| DND-4.3 | Condiciones | Aplicar/retirar con **resumen de reglas 2024**; Exhaustion por niveles. | P1 | F3 | 2.5, 2.9 |
| DND-4.4 | Efectos con rondas | Lista con contador; botón `tick`; badge de concentración; `break_concentration`. | P1 | F3 | 2.5 |
| DND-4.5 | Descansos | Corto (elegir dados de golpe) y largo con resumen de lo recuperado. | P1 | F3 | 2.5 |

---

## E5 · Hechizos (grimorio)  · P1 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-5.1 | Grimorio y preparación | Lista por nivel; aprender/olvidar/preparar/despreparar; marca "siempre preparado". | P1 | F3 | 2.4 |
| DND-5.2 | Lanzar con slots | Slots visibles, upcasting, pacto aparte, ritual/`no_slot`; muestra DC y ataque de conjuro; concentración visible. | P1 | F3 | 5.1, 4.4 |
| DND-5.3 | Ajuste manual de slots | UI para `set_max`/`spend`/`recover`/`recover_all`. | P2 | F3 | 2.4 |

---

## E6 · Inventario  · P1 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-6.1 | Lista y acciones | Añadir (autocompleta desde contenido), equipar/desequipar, sintonizar (máx 3), actualizar, quitar. | P1 | F3 | 2.3 |
| DND-6.2 | Contenedores | Mover objetos dentro de mochilas/bolsas; vista anidada. | P2 | F3 | 6.1 |
| DND-6.3 | Monedas y carga | Editor de monedas + total en oro; barra peso/capacidad (FUE×15). | P1 | F3 | 2.3 |

---

## E7 · Compañeros  · P2 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-7.1 | Tarjetas de compañeros | Crear/editar/borrar con PG/CA/velocidad/ataques/condiciones/arte; damage/heal rápido. | P2 | F3 | 2.6 |

---

## E8 · Dados y pruebas  · P1 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-8.1 | Bandeja de dados | Entrada de notación + atajos (d20 ventaja/desventaja); historial con desglose; animación simple; crítico/pifia. | P1 | F3 | 2.7 |
| DND-8.2 | Pruebas del personaje | Botones para skill/save/ability/initiative/attack/spell_attack/damage con modificadores calculados. | P1 | F3 | 2.7, 3.3 |

---

## E9 · Personalización de hoja  · P2 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-9.1 | Editor de estilo | Panel de tema/color/tipografía/layout/retrato/`customCss`/`tokens` con **vista previa en vivo**; persiste vía `PATCH …/style`. | P2 | F3 | 3.4, 2.8 |

---

## E10 · Contenido / content packs (UI)  · P1 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-10.1 | Biblioteca de contenido | Buscar/filtrar (tipo, nivel, clase) y ver entrada completa. | P1 | F3 | 2.9 |
| DND-10.2 | Gestión de packs | Importar/actualizar y eliminar packs; muestra conteo por tipo; `srd-core` re-sembrado. | P1 | F3 | 2.9 |

---

## E11 · Biblioteca multi-personaje y entrega a terceros  · P1–P2 · F3  *(NUEVO)*
Crear cuantos personajes individuales se quiera y **entregar personajes distintos a otras personas** (alcance v1: archivo `.dndchar` + PDF; sin hosting).

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-11.1 | Biblioteca multi-personaje | Crear personajes ilimitados e independientes; buscar/filtrar por nombre/clase/nivel; **archivar** sin borrar; contador y orden. | P1 | F3 | 3.2 |
| DND-11.2 | Duplicar personaje | `POST /api/characters/:id/duplicate`: id nuevo, nombre "… (copia)", estado independiente del original. | P2 | F3 | 2.2, 11.1 |
| DND-11.3 | Paquete `.dndchar` autocontenido | `POST /api/characters/:id/package`: JSON con personaje + **content packs referenciados** + `SheetStyle` con retrato embebido (data URL). Descarga como archivo. Respeta límite de tamaño (R8). | P1 | F3 | 2.9, 11.1 |
| DND-11.4 | Importar `.dndchar` | `POST /api/characters/import-package`: instala/actualiza packs incluidos (sin pisar homebrew propio salvo confirmación), id nuevo, renombra colisión, informa dependencias faltantes. | P1 | F3 | 11.3 |
| DND-11.5 | Entregable de solo lectura (PDF/impresión) | `GET /api/characters/:id/sheet.pdf` (o `window.print()` + CSS impresión) genera hoja legible respetando estilo; Markdown existente sigue disponible. | P1 | F3 | 3.3 |
| DND-11.6 | Entrega en lote | `POST /api/characters/export-batch`: multi-selección de personajes → un solo archivo (party/pregenerados) para repartir después. | P2 | F3 | 11.3 |

---

## E12 · Wizards  · P1 · F3

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-12.1 | Wizard de creación | Flujo guiado por el **contenido instalado** (clase→especie→trasfondo→características→skills→equipo→hechizos). Crea vía API. | P1 | F3 | 3.1, 2.9 |
| DND-12.2 | Wizard de subida de nivel | Guía clase/subclase, tirada o promedio de PG, ASI, nuevos rasgos/hechizos del nivel desde el contenido. | P1 | F3 | 2.2, 2.9 |

---

## E13 · PWA + responsive  · P1 · F4

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-13.1 | Manifest + service worker | Instalable; assets cacheados; icono/tema. | P1 | F4 | E3 |
| DND-13.2 | Offline y reconciliación | Hoja consultable/editable sin red; cambios se reconcilian al reconectar. | P1 | F4 | 13.1 |
| DND-13.3 | Pulido responsive | Cómodo en móvil ≥360px, tablet y desktop; objetivos táctiles ≥44px; navegación por teclado y contraste. | P1 | F4 | E3–E12 |

---

## E14 · Estados y modificadores activos (efecto mecánico)  · P1 · F1–F3  *(NUEVO)*
Que condiciones, concentración y conjuros **afecten los valores derivados** (CA, velocidad, ventaja/desventaja, auto-fallos, incapacitación) y se **trackeen dentro y fuera de combate**. Hoy solo se listan sin impacto mecánico.

| ID | Título | AC clave | Prio | Fase | Dep |
|---|---|---|---|---|---|
| DND-14.1 | Modelo `StatModifier` + tipos | Añadir `StatModifier` y campo opcional `mechanics: StatModifier[]` a `ActiveCondition`/`ActiveEffect` en `types.ts`. **Sin `any`; solo campos opcionales → `characters.json` sigue compatible** (R9). | P1 | F1 | 1.1 |
| DND-14.2 | Motor de modificadores en `computedSheet` | Dominio agrega base + modificadores activos y devuelve valores finales con desglose/fuentes: CA, velocidad (0 si Restrained/Grappled/Paralyzed/etc.; ×2/±X conjuros), ventaja/desventaja, auto-fallo FUE/DES, incapacitación, "ataques contra ti con ventaja". **Sigue las reglas de combinación de §13.A del PRD** (ventaja/desventaja no apilan; mismo nombre no apila; base única vs bonos que suman; orden CA→velocidad→d20; R10). Tests por regla. | P1 | F1 | 14.1 |
| DND-14.3 | SRD: mecánicas de condiciones y conjuros | Enriquecer `srd-core.json` con bloque `mechanics[]`: las 15 condiciones (incl. Exhaustion por nivel) y los conjuros con efecto mecánico que **ya trae el pack** (Shield, Bless, Haste, Guidance, Hunter's Mark, Spirit Guardians, Hold Person, Invisibility). Valores/formato según **§13.C y §13.D del PRD**; otros (Mage Armor, Longstrider…) entran vía packs. Mantiene atribución CC-BY-4.0. | P1 | F1 | 14.1 |
| DND-14.4 | Duración fuera de combate | Soportar minutos/horas además de rondas; `tick` temporal; expirar retira modificadores. Tests. | P1 | F1 | 14.2 |
| DND-14.5 | Concentración retira modificadores | Al romper concentración (daño, condición incapacitante, nuevo conjuro, muerte) se retiran los modificadores del efecto concentrado; integrar con `domain/combat.ts`. Tests. | P1 | F1 | 14.2, 1.5 |
| DND-14.6 | API de modificadores | `computedSheet` expone valores finales + `activeModifiers` con fuentes; `/effects` y `/conditions` aceptan `mechanics[]` inline; `GET /api/characters/:id/modifiers`. Smoke. | P1 | F2 | 14.2, 2.5 |
| DND-14.7 | UI hoja: valores afectados | La hoja resalta CA/velocidad/salvaciones/iniciativa afectadas con origen y signo (buff verde / debuff rojo) y tooltip de desglose. Sin cálculo en UI. | P1 | F3 | 14.6, 3.3 |
| DND-14.8 | UI: barra de estados activos | Panel/barra de estados con resumen mecánico, visible **dentro y fuera de combate**; crear/retirar efecto con modificadores inline; indicador de concentración. | P1 | F3 | 14.6, 4.4 |

---

## Matriz resumen

| Épica | Prioridad | Fase | Depende de |
|---|---|---|---|
| E0 Fundaciones | P0 | F1 | — |
| E1 Dominio | P0 | F1 | E0 |
| E2 API + estáticos | P0 | F2 | E1 |
| E3 Frontend + Hoja | P1 | F3 | E2 |
| E4 Combate | P1 | F3 | E3 |
| E5 Hechizos | P1 | F3 | E3 |
| E6 Inventario | P1 | F3 | E3 |
| E7 Compañeros | P2 | F3 | E3 |
| E8 Dados/pruebas | P1 | F3 | E3 |
| E9 Personalización | P2 | F3 | E3 |
| E10 Contenido UI | P1 | F3 | E3 |
| E11 Multi-personaje + entrega | P1–P2 | F3 | E3 |
| E12 Wizards | P1 | F3 | E3 |
| E13 PWA + responsive | P1 | F4 | E3+ |
| E14 Estados/modificadores activos | P1 | F1–F3 | E1, E4 |

## Mapa PRD → tickets

| PRD | Tickets |
|---|---|
| §4.1 Arquitectura / dominio | E1 (todo), 1.9 |
| §5.1 Personajes | 1.2, 2.2, 3.2/3.3, 12.1/12.2 |
| §5.2 Inventario/dinero | 1.3, 2.3, E6 |
| §5.3 Hechizos | 1.4, 2.4, E5 |
| §5.4 Combate | 1.5, 2.5, E4 |
| §5.5 Compañeros | 1.6, 2.6, E7 |
| §5.6 Dados/pruebas | 1.7, 2.7, E8 |
| §5.7 Estilo | 1.8, 2.8, 3.4, E9 |
| §5.8 Contenido | 1.8, 2.9, E10 |
| §5.9 Multi-personaje + entrega | E11 |
| §5.10 Estados/modificadores activos | E14 |
| §6 API | E2, 11.2–11.6, 14.6 |
| §7 No funcionales | 0.2, 3.4, E13, tests en E1/E2 |
| §8 Pantallas | E3–E12 |
| §9 Roadmap | Fases F1–F4 |
