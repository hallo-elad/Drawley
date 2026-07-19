# PRD — Drawley

*Product Requirements Document*

---

## 1. Goal & Problem

**What we are building:** Drawley is a modern, browser-based drawing application. It lets anyone create digital artwork — sketches, illustrations, simple animations — directly in the browser, with no install and no account required.

**The problem:** Most capable drawing tools are either heavy native applications (Photoshop, Krita) that require installation and a learning curve, or online tools that are locked behind sign-up walls and cloud accounts. There is room for a fast, zero-friction drawing app that runs entirely in the browser, stores work locally, and can be shared with a single link.

**Why it matters:** A drawing app is a strong demonstration of non-trivial front-end engineering — a real-time rendering loop, coordinate math (pan/zoom), a layered document model, an undo/redo history, and persistent local storage. It goes well beyond CRUD.

---

## 2. Target User & Use Case

**Target users**
- Hobbyist artists and doodlers who want to sketch quickly without opening a heavy program.
- Students / educators needing a quick canvas for diagrams or annotations.
- Anyone on a tablet or laptop who wants a lightweight drawing surface with layers.

**Primary use case**
> "I open Drawley in my browser, pick a brush and a colour, sketch on a layered canvas, adjust and erase, then export the result as a PNG or share it as a link — all without signing up, and my work is still there when I come back."

---

## 3. Scope

### In scope
- A drawing canvas with pan, zoom, and fit-to-screen.
- A toolbox: brush, pencil, eraser, line, rectangle, ellipse, fill bucket, text, eyedropper, and selection/move tools.
- A layer system (add, delete, duplicate, reorder, opacity, blend modes, visibility, lock).
- Undo / redo history.
- Colour controls (picker, hex input, swatches, recent colours, canvas background).
- Selection tools (rectangular marquee + lasso), move, copy/cut/paste/duplicate, flip and rotate.
- A short frame-based **animation timeline** with onion-skinning and playback.
- Local persistence (IndexedDB with a localStorage fallback) + autosave.
- A local gallery of saved drawings.
- Export to PNG / JPEG at selectable resolution.
- Client-side sharing via a compressed URL (no backend).
- Light / dark theme, keyboard shortcuts, and installable PWA / offline support.

### Out of scope (explicitly not building)
- **User accounts, authentication, or a cloud backend** — everything is client-side.
- **Real-time multi-user collaboration** — would require a server (WebSocket/CRDT).
- **Cross-device cloud sync** — data lives in the browser only.
- **Animated GIF / video export** — the timeline is a preview/authoring feature; frame data is session-only.
- **Vector editing** — Drawley is a raster (pixel) editor only.
- **Mobile-native apps** — browser/PWA only.

---

## 4. Functional Requirements (User Stories)

**Drawing**
- As a user, I can select a tool (brush, pencil, eraser, shapes, fill, text, eyedropper) and draw on the canvas.
- As a user, I can change brush size, opacity, hardness, and pressure/smoothing dynamics.
- As a user, I can pan and zoom the canvas, and fit it to the screen.

**Layers**
- As a user, I can add, delete, duplicate, reorder, hide, and lock layers.
- As a user, I can set each layer's opacity and blend mode.

**Editing**
- As a user, I can undo and redo my actions.
- As a user, I can make a rectangular or lasso selection and move, copy, cut, paste, duplicate, or delete it.
- As a user, I can flip and rotate a selection or the whole canvas.
- As a user, I can import an image (button, drag-and-drop, or paste) as a new layer.

**Colour**
- As a user, I can choose a colour via a picker, hex input, or swatches, and pick colours from the canvas.

**Animation**
- As a user, I can add/duplicate/delete/reorder animation frames.
- As a user, I can toggle onion-skinning and play back frames at a chosen FPS.

**Persistence & output**
- As a user, my work autosaves and can be saved to a local gallery and reopened.
- As a user, I can export my drawing as a PNG/JPEG image.
- As a user, I can share my drawing as a link that opens on any device.
- As a user, I can install Drawley and use it offline.

---

## 5. Technical Choices

| Area | Choice | Rationale |
| --- | --- | --- |
| Language | **TypeScript** | Type safety across a non-trivial state model |
| UI framework | **React 18** | Component model + `useSyncExternalStore` for cheap re-renders |
| Build tool | **Vite 6** | Fast dev server and optimized production build |
| Rendering | **HTML5 Canvas 2D** | Direct pixel control at interactive frame rates |
| Icons | **lucide-react** | Lightweight, consistent icon set |
| Compression | **lz-string** | Compress artwork into shareable URL fragments |
| Persistence | **IndexedDB** (localStorage fallback) | Store larger image payloads reliably |
| Offline | **Service Worker + Web Manifest** | Installable, offline-capable PWA |

**Key architectural constraint:** pixel data is kept **out of React state**. A single `DrawingEngine` class owns the canvases and exposes an immutable state snapshot; React subscribes via `useSyncExternalStore` and only re-renders on metadata changes, never on raw pixel mutations. This keeps drawing fast.

---

## 6. Data

**Data sources — all local, no external API:**
- **IndexedDB** (`drawley` database, `drawings` store) — saved drawings for the gallery.
- **localStorage** — autosave snapshot (`drawley:autosave`) and the shared/public gallery index (`drawley:gallery`).
- **URL fragment** — a shared artwork is serialized, compressed with lz-string, and encoded into the link's hash, so sharing needs no server.

**Core entities**
- **`EngineState`** — the immutable UI-facing document state (active tool, colour, brush settings, layers metadata, zoom/pan, selection, frames, etc.).
- **`LayerMeta`** — a layer's id, name, visibility, opacity, lock, and blend mode (pixels live in the engine's off-screen canvases).
- **`SavedDrawing`** — a persisted document: metadata, background, a thumbnail, and per-layer serialized PNG data.
- **`FrameInfo`** — an animation frame reference (id + thumbnail).

---

## 7. Definition of Done

The project is "done" when:
1. The app builds cleanly (`npm run build`) and runs (`npm run dev`) with no console crashes.
2. A user can draw with multiple tools on multiple layers, undo/redo, and see results correctly.
3. Selections can be created, moved, and transformed; images can be imported.
4. A drawing can be **saved locally, reopened from the gallery, exported as an image, and shared via a link**.
5. The animation timeline can add frames, onion-skin, and play back.
6. The app installs as a PWA and loads offline.
7. `PRD.md`, `tasks.md`, and `README.md` are present and accurate, and the Git history reflects incremental development.

---

## 8. Wireframe (layout sketch)

```
┌────────────────────────────────────────────────────────────┐
│ TopBar:  Logo | Title | New Open Resize Image | Save Export │
│          Share | Gallery Shortcuts Fullscreen Theme         │
├──────┬──────────────────────────────────────────┬───────────┤
│ Tool │                                          │  Color    │
│ bar  │              Canvas Stage                │  Tool opts│
│ (◧)  │        (pan / zoom / draw here)          │  Layers   │
│      │                                          │           │
├──────┴──────────────────────────────────────────┴───────────┤
│ Timeline:  ▶ fps  onion | + ⧉ | [f1][f2][f3]…   Frame 2/3   │
├──────────────────────────────────────────────────────────────┤
│ StatusBar:  zoom · canvas size · cursor position             │
└──────────────────────────────────────────────────────────────┘
```
