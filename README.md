<div align="center">

# 🎨 Drawley

**A modern, browser-based drawing studio.**
Create digital artwork on an infinite-feeling canvas, work with layers, export in
high resolution, and share your creations with a single link — all running entirely
in the browser with no backend required.

</div>

---

## ✨ Features

### Drawing
- **Freehand brush & pencil** with smooth, pressure-sensitive strokes and stroke smoothing
- **Eraser** with adjustable size
- **Shape tools** — line, rectangle, ellipse (hold **Shift** to constrain to squares / circles / 45° lines)
- **Paint bucket** flood fill with edge tolerance
- **Eyedropper** to sample any colour on the canvas
- **Adjustable brush size & opacity**, plus reusable **brush presets** (Fine Liner, Marker, Paint Brush, Inker, Soft Air)
- **Custom colour picker**, palette swatches, and an automatic **recent colours** strip
- **Configurable canvas background** colour

### Layers (Bonus)
- Unlimited layers with **visibility, lock, opacity, rename, duplicate, reorder & delete**
- Per-layer opacity compositing

### Canvas & Navigation
- **Zoom** (mouse wheel / pinch / buttons / `Ctrl +`,`Ctrl -`) anchored to the cursor
- **Pan** with the Hand tool, **Space-drag**, middle mouse, or trackpad two-finger scroll
- **Fit-to-screen** and **actual-size** controls
- **Resize canvas** with presets and top-left / centre anchoring
- **Grid toggle + snap-to-grid** with adjustable grid size
- Fully **responsive** — works with mouse, trackpad, pen and touch

### File Management
- **New** drawing with size presets and background options
- **Save / Open** drawings locally (IndexedDB, with a localStorage fallback)
- **Autosave** — your work is restored automatically when you return
- **Export** as **PNG** (with optional transparency) or **JPEG** (quality control)
- **High-resolution export** at 1× / 2× / 4×

### Sharing & Gallery
- **Generate a shareable link** — the artwork is encoded (and compressed) directly into the URL,
  so links work on any device with no server or account
- **Copy-link** button and one-click **open**
- **Public gallery** page showcasing shared artwork (seeded with sample pieces)
- **Title & description** support, plus **“Edit a copy”** from any shared link

### Interface
- **Dark & light modes** (remembers your choice, respects system preference)
- Clean, minimalist, **professional creative-tool aesthetic** focused on the canvas
- Toolbar with clear icons, tooltips and labels
- Smooth animations and transitions
- **Keyboard shortcuts** throughout (press the ⌨️ icon in-app for the full list)
- **Fullscreen** mode

---

## ⌨️ Keyboard Shortcuts

| Action | Shortcut | | Action | Shortcut |
|---|---|---|---|---|
| Brush | `B` | | Undo | `Ctrl + Z` |
| Pencil | `P` | | Redo | `Ctrl + Y` / `Ctrl + Shift + Z` |
| Eraser | `E` | | Save | `Ctrl + S` |
| Line | `L` | | New | `Ctrl + N` |
| Rectangle | `R` | | Export | `Ctrl + E` |
| Ellipse | `O` | | Zoom in / out | `Ctrl + +` / `Ctrl + -` |
| Fill | `G` | | Fit to screen | `Ctrl + 0` |
| Eyedropper | `I` | | Decrease / increase size | `[` / `]` |
| Pan | `H` / hold `Space` | | Clear active layer | `Delete` |
| Fullscreen | `F` | | | |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** (developed on Node 24)
- npm (or pnpm / yarn)

### Install & run

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev

# 3. Build for production
npm run build

# 4. Preview the production build
npm run preview
```

The production build outputs static files to `dist/` — deploy them to **any** static
host (Netlify, Vercel, GitHub Pages, S3, nginx…). No server-side code is required.

---

## 🏗️ Architecture

Drawley is built with **React 18 + TypeScript + Vite** and a custom canvas engine.

```
src/
├── engine/
│   ├── DrawingEngine.ts   # Single source of truth: layers, history, rendering,
│   │                      #   tools, zoom/pan, serialization, export
│   └── floodFill.ts       # Scanline flood-fill for the paint bucket
├── hooks/
│   ├── useEngine.ts       # Engine context + useSyncExternalStore binding
│   ├── useTheme.tsx       # Dark / light theme provider
│   └── useHotkeys.ts      # Global keyboard shortcuts
├── lib/
│   ├── storage.ts         # IndexedDB persistence + autosave (localStorage fallback)
│   ├── share.ts           # URL-encoded sharing + local gallery (with sample data)
│   └── download.ts        # File-download helpers
├── components/
│   ├── Editor.tsx         # Workspace layout, modals & autosave wiring
│   ├── CanvasStage.tsx    # Pointer / wheel / touch input → engine
│   ├── TopBar, Toolbar, RightPanel, ColorPanel, ToolOptions,
│   │   LayersPanel, StatusBar, Logo
│   ├── GalleryPage.tsx    # Public gallery
│   ├── ShareViewPage.tsx  # Shared-artwork viewer
│   ├── modals/            # Export, Share, Resize, New, Open, Shortcuts dialogs
│   └── ui/                # Reusable Modal, Slider, Toast primitives
├── types.ts               # Shared type definitions
├── App.tsx                # Hash routing + providers
└── main.tsx               # Entry point
```

### Key design decisions

- **Engine-owned pixels, React-owned UI.** The `DrawingEngine` holds every layer as an
  off-screen `<canvas>` and exposes an *immutable* state snapshot consumed by React via
  `useSyncExternalStore`. Raw pixel mutations never trigger React re-renders, so drawing
  stays fast even with many layers.
- **Single requestAnimationFrame render loop** with a dirty flag — the screen only
  repaints when something actually changed.
- **Scratch-buffer strokes.** Freehand strokes and shapes are accumulated on a scratch
  canvas at full opacity and flattened onto the active layer on pointer-up, giving
  uniform stroke opacity with no overlap darkening.
- **Snapshot-based undo/redo** of the full document (capped history).
- **Backend-free sharing.** A shared artwork is compressed with `lz-string` and embedded
  in the share URL, so links are self-contained and portable.

---

## 🧰 Tech Stack

| | |
|---|---|
| Framework | React 18 + TypeScript |
| Build tool | Vite 6 |
| Icons | lucide-react |
| Compression | lz-string (share links) |
| Storage | IndexedDB + localStorage |
| Rendering | HTML5 Canvas 2D |

---

## 📦 Sample Data

The **Community Gallery** is seeded with four procedurally-generated sample artworks the
first time it loads, so the gallery is never empty. Your own published pieces and any
shared links you save are added alongside them.

---

## 📄 License

MIT — build something beautiful.

<div align="center">
<sub>Made with care for creators. <strong>Drawley</strong>.</sub>
</div>
