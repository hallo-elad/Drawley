# Tasks — Drawley

Work plan derived from [`PRD.md`](./PRD.md). Tasks are ordered by execution and sized roughly one-per-commit. Checked boxes reflect completed work.

> Rule of thumb: **one task ≈ one commit**, so the Git history tells the development story.

---

## Milestone 0 — Project setup
- [x] Scaffold Vite + React + TypeScript project and base folder structure
- [x] Add global styles, theme variables, and light/dark theme provider
- [x] Define core domain types (`ToolId`, `EngineState`, `LayerMeta`, `SavedDrawing`)

## Milestone 1 — Drawing engine core
- [x] Implement `DrawingEngine` as the single source of truth (state snapshot + off-screen canvases)
- [x] Wire React to the engine via `useSyncExternalStore` (`useEngine`, `useEngineState`)
- [x] Implement the render loop, world↔screen transforms, pan and zoom
- [x] Implement the `CanvasStage` component (pointer input, wheel zoom, pinch/pan gestures)

## Milestone 2 — Tools & colour
- [x] Implement brush, pencil, and eraser stroke rendering
- [x] Implement line, rectangle, and ellipse shape tools (with shift-constrain)
- [x] Implement fill bucket (flood fill) and eyedropper
- [x] Build the `Toolbar` and contextual `ToolOptions` (size, opacity, presets, grid)
- [x] Build the `ColorPanel` (picker, hex input, swatches, recent colours, background)

## Milestone 3 — Layers & history
- [x] Implement layer operations (add, remove, duplicate, reorder, visibility, lock, opacity)
- [x] Build the `LayersPanel` UI
- [x] Implement undo/redo history with document snapshots

## Milestone 4 — Persistence, export & sharing
- [x] Implement local persistence (IndexedDB + localStorage fallback) and autosave
- [x] Build the gallery page (list, open, delete saved drawings)
- [x] Implement PNG/JPEG export with resolution options + `ExportModal`
- [x] Implement client-side sharing via compressed URL + `ShareModal` / share view page
- [x] Add keyboard shortcuts and the `ShortcutsModal`

## Milestone 5 — Phase 1: fill the obvious gaps
- [x] Add the **text tool** (in-canvas editor overlay → rasterised text)
- [x] Add **filled shapes** (stroke / fill / both mode)
- [x] Add per-layer **blend modes**
- [x] Add **Alt-click eyedropper** (sample without switching tools)
- [x] Wire up **brush hardness** (soft-edged brushes)

## Milestone 6 — Phase 2: selection & transform
- [x] Add selection types and tools (**rectangular marquee** + **lasso**) with marching-ants overlay
- [x] Implement **floating selection + move** tool
- [x] Implement **copy / cut / paste / duplicate / delete** with an internal clipboard
- [x] Constrain paint / fill / erase to the active selection
- [x] Add **image import** (button, drag-and-drop, paste) and **flip / rotate** for selection & canvas

## Milestone 7 — Phase 3: PWA & animation
- [x] Add **PWA support** (web manifest, service worker, offline app shell, install meta)
- [x] Add **animation frame model** (add / duplicate / delete / reorder / select) with thumbnails
- [x] Add **playback timer** and **onion-skinning** render
- [x] Build the `Timeline` UI and wire frame-navigation hotkeys

## Milestone 8 — Documentation
- [x] Write `PRD.md`, `tasks.md`, and `README.md`

---

## Backlog / future work (out of current scope)
- [ ] Persist animation frames to the gallery / share format
- [ ] Animated GIF / video export
- [ ] Real-time collaboration (requires a backend)
- [ ] Cloud sync & user accounts (requires a backend)
- [ ] Performance: tile-based dirty-rect rendering + diff-based history
