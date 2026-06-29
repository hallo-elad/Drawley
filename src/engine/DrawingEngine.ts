import type {
  BrushPreset,
  EngineState,
  GridConfig,
  LayerMeta,
  Point,
  SavedDrawing,
  SerializedLayer,
  ToolId,
} from '../types';
import { floodFill } from './floodFill';

/** Generate a short unique id. */
export function uid(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
}

const MAX_HISTORY = 40;
const MAX_RECENT_COLORS = 12;

const DEFAULT_SWATCHES = [
  '#000000', '#ffffff', '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#06b6d4', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#78716c', '#1e293b',
];

const DEFAULT_PRESETS: BrushPreset[] = [
  { id: 'p-fine', name: 'Fine Liner', tool: 'pencil', size: 2, opacity: 1, pressure: false },
  { id: 'p-marker', name: 'Marker', tool: 'brush', size: 14, opacity: 0.85, pressure: false },
  { id: 'p-paint', name: 'Paint Brush', tool: 'brush', size: 26, opacity: 1, pressure: true },
  { id: 'p-ink', name: 'Inker', tool: 'brush', size: 8, opacity: 1, pressure: true },
  { id: 'p-soft', name: 'Soft Air', tool: 'brush', size: 40, opacity: 0.35, pressure: true },
];

/** A single undo/redo snapshot of the full document. */
interface HistorySnapshot {
  width: number;
  height: number;
  background: string;
  activeLayerId: string;
  layers: { meta: LayerMeta; data: string }[];
}

interface StrokeState {
  tool: ToolId;
  points: Point[];
  startWorld: Point;
  lastWorld: Point;
  /** Modifier held when the stroke started (shift = constrain). */
  shift: boolean;
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function defaultState(width: number, height: number): EngineState {
  const baseLayer: LayerMeta = {
    id: uid('layer-'),
    name: 'Layer 1',
    visible: true,
    opacity: 1,
    locked: false,
  };
  return {
    tool: 'brush',
    previousTool: 'brush',
    color: '#6d5efc',
    background: '#ffffff',
    brushSize: 12,
    opacity: 1,
    hardness: 0.9,
    pressureEnabled: true,
    smoothing: true,
    layers: [baseLayer],
    activeLayerId: baseLayer.id,
    zoom: 1,
    panX: 0,
    panY: 0,
    canvasWidth: width,
    canvasHeight: height,
    grid: { show: false, size: 32, snap: false },
    recentColors: [],
    swatches: DEFAULT_SWATCHES,
    presets: DEFAULT_PRESETS,
    canUndo: false,
    canRedo: false,
    title: 'Untitled Drawing',
    description: '',
    dirty: false,
  };
}

/**
 * DrawingEngine is the single source of truth for a Drawley document.
 *
 * It keeps an immutable `EngineState` snapshot (consumed by React via
 * `useSyncExternalStore`) plus a set of off-screen layer canvases that hold the
 * actual pixels. Keeping pixels out of React state is what keeps drawing fast:
 * strokes mutate canvases directly and only metadata changes notify React.
 */
export class DrawingEngine {
  private state: EngineState;
  private listeners = new Set<() => void>();

  /** Off-screen pixel buffers, one per layer id. */
  private layerCanvases = new Map<string, HTMLCanvasElement>();
  /** Scratch buffer holding the in-progress stroke/shape at full opacity. */
  private scratch: HTMLCanvasElement;
  private scratchCtx: CanvasRenderingContext2D;

  private screen: HTMLCanvasElement | null = null;
  private screenCtx: CanvasRenderingContext2D | null = null;
  /** CSS size of the visible viewport in device-independent pixels. */
  private viewW = 0;
  private viewH = 0;
  private dpr = 1;

  private stroke: StrokeState | null = null;
  private undoStack: HistorySnapshot[] = [];
  private redoStack: HistorySnapshot[] = [];

  private needsRender = false;
  private rafId = 0;

  /** Cursor position in world space, for the brush ring preview. */
  cursorWorld: Point | null = null;

  constructor(width = 1280, height = 800) {
    this.state = defaultState(width, height);
    const first = this.state.layers[0];
    this.layerCanvases.set(first.id, createCanvas(width, height));
    this.scratch = createCanvas(width, height);
    this.scratchCtx = this.scratch.getContext('2d')!;
    this.loop = this.loop.bind(this);
    this.rafId = requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------------------
  // React store interface (useSyncExternalStore)
  // ---------------------------------------------------------------------------

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  getSnapshot = (): EngineState => this.state;

  private emit() {
    for (const l of this.listeners) l();
  }

  /** Replace state immutably and notify subscribers. */
  private setState(patch: Partial<EngineState>, markDirty = false) {
    this.state = { ...this.state, ...patch };
    if (markDirty) this.state = { ...this.state, dirty: true };
    this.emit();
  }

  // ---------------------------------------------------------------------------
  // Screen attachment & rendering
  // ---------------------------------------------------------------------------

  attachScreen(canvas: HTMLCanvasElement) {
    this.screen = canvas;
    this.screenCtx = canvas.getContext('2d')!;
    this.requestRender();
  }

  detachScreen() {
    this.screen = null;
    this.screenCtx = null;
  }

  /** Update the viewport size (called on container resize). */
  setViewport(cssW: number, cssH: number, dpr: number) {
    this.viewW = cssW;
    this.viewH = cssH;
    this.dpr = dpr;
    if (this.screen) {
      this.screen.width = Math.round(cssW * dpr);
      this.screen.height = Math.round(cssH * dpr);
      this.screen.style.width = `${cssW}px`;
      this.screen.style.height = `${cssH}px`;
    }
    this.requestRender();
  }

  requestRender() {
    this.needsRender = true;
  }

  private loop() {
    if (this.needsRender) {
      this.render();
      this.needsRender = false;
    }
    this.rafId = requestAnimationFrame(this.loop);
  }

  dispose() {
    cancelAnimationFrame(this.rafId);
    this.listeners.clear();
  }

  private getCtx(id: string): CanvasRenderingContext2D {
    return this.layerCanvases.get(id)!.getContext('2d')!;
  }

  /** Composite all layers into one canvas (used for export / thumbnails). */
  composite(withBackground = true): HTMLCanvasElement {
    const { canvasWidth: w, canvasHeight: h } = this.state;
    const out = createCanvas(w, h);
    const ctx = out.getContext('2d')!;
    if (withBackground) {
      ctx.fillStyle = this.state.background;
      ctx.fillRect(0, 0, w, h);
    }
    for (const layer of this.state.layers) {
      if (!layer.visible) continue;
      const c = this.layerCanvases.get(layer.id);
      if (!c) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(c, 0, 0);
    }
    ctx.globalAlpha = 1;
    return out;
  }

  /** The main render: paints the world into the visible viewport. */
  private render() {
    const ctx = this.screenCtx;
    if (!ctx || !this.screen) return;
    const s = this.state;
    const dpr = this.dpr;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.screen.width, this.screen.height);

    // World -> device transform (pan is stored in CSS px).
    ctx.setTransform(
      s.zoom * dpr,
      0,
      0,
      s.zoom * dpr,
      s.panX * dpr,
      s.panY * dpr,
    );

    // Drop shadow + paper background of the document.
    ctx.imageSmoothingEnabled = s.zoom < 4;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 24 / s.zoom;
    ctx.shadowOffsetY = 8 / s.zoom;
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, s.canvasWidth, s.canvasHeight);
    ctx.restore();

    // Layers, with the in-progress scratch composited above the active layer.
    for (const layer of s.layers) {
      if (!layer.visible) continue;
      const c = this.layerCanvases.get(layer.id);
      if (!c) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.drawImage(c, 0, 0);
      if (this.stroke && layer.id === s.activeLayerId) {
        // Eraser previews are applied directly to the layer, so only paint
        // scratch for additive tools.
        ctx.globalAlpha = layer.opacity * (this.stroke.tool === 'eraser' ? 1 : s.opacity);
        if (this.stroke.tool !== 'eraser') ctx.drawImage(this.scratch, 0, 0);
      }
    }
    ctx.globalAlpha = 1;

    if (s.grid.show) this.drawGrid(ctx);

    // Document border.
    ctx.lineWidth = 1 / s.zoom;
    ctx.strokeStyle = 'rgba(128,128,128,0.5)';
    ctx.strokeRect(0, 0, s.canvasWidth, s.canvasHeight);

    // Brush cursor ring (hidden while actively drawing / panning).
    if (this.cursorWorld && !this.stroke && this.isPaintTool(s.tool)) {
      const r = this.effectiveSize(1) / 2;
      ctx.lineWidth = 1 / s.zoom;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(this.cursorWorld.x, this.cursorWorld.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(this.cursorWorld.x, this.cursorWorld.y, r + 1 / s.zoom, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D) {
    const s = this.state;
    const step = s.grid.size;
    ctx.save();
    ctx.lineWidth = 1 / s.zoom;
    ctx.strokeStyle = 'rgba(128,128,128,0.25)';
    ctx.beginPath();
    for (let x = 0; x <= s.canvasWidth; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s.canvasHeight);
    }
    for (let y = 0; y <= s.canvasHeight; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(s.canvasWidth, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Coordinate transforms
  // ---------------------------------------------------------------------------

  /** Convert a viewport (CSS px, relative to canvas) point to world coords. */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const s = this.state;
    return { x: (sx - s.panX) / s.zoom, y: (sy - s.panY) / s.zoom };
  }

  private maybeSnap(p: { x: number; y: number }): { x: number; y: number } {
    const g = this.state.grid;
    if (!g.snap) return p;
    return { x: Math.round(p.x / g.size) * g.size, y: Math.round(p.y / g.size) * g.size };
  }

  // ---------------------------------------------------------------------------
  // Pointer input
  // ---------------------------------------------------------------------------

  private isPaintTool(t: ToolId): boolean {
    return t === 'brush' || t === 'pencil' || t === 'eraser';
  }

  private effectiveSize(pressure: number): number {
    const { brushSize, pressureEnabled } = this.state;
    if (!pressureEnabled) return brushSize;
    // Keep a sensible minimum so light touches still register.
    return Math.max(1, brushSize * (0.25 + 0.75 * pressure));
  }

  setCursor(sx: number, sy: number) {
    const w = this.screenToWorld(sx, sy);
    this.cursorWorld = { x: w.x, y: w.y, pressure: 1 };
    this.requestRender();
  }

  clearCursor() {
    this.cursorWorld = null;
    this.requestRender();
  }

  pointerDown(sx: number, sy: number, pressure: number, shift: boolean) {
    const s = this.state;
    const world = this.maybeSnap(this.screenToWorld(sx, sy));
    const p: Point = { x: world.x, y: world.y, pressure };

    if (s.tool === 'eyedropper') {
      this.pickColor(world.x, world.y);
      return;
    }
    if (s.tool === 'fill') {
      this.applyFill(world.x, world.y);
      return;
    }

    const layer = s.layers.find((l) => l.id === s.activeLayerId);
    if (this.isPaintTool(s.tool) || s.tool === 'line' || s.tool === 'rectangle' || s.tool === 'ellipse') {
      if (layer?.locked) return;
    }

    this.stroke = { tool: s.tool, points: [p], startWorld: p, lastWorld: p, shift };
    this.scratchCtx.clearRect(0, 0, this.scratch.width, this.scratch.height);

    if (this.isPaintTool(s.tool)) {
      // Dab once so a click produces a dot.
      this.paintSegment(p, p);
    }
    this.requestRender();
  }

  pointerMove(sx: number, sy: number, pressure: number, shift: boolean) {
    this.setCursor(sx, sy);
    if (!this.stroke) return;
    const world = this.maybeSnap(this.screenToWorld(sx, sy));
    const p: Point = { x: world.x, y: world.y, pressure };
    this.stroke.shift = shift;

    const t = this.stroke.tool;
    if (this.isPaintTool(t)) {
      const last = this.stroke.lastWorld;
      if (this.state.smoothing && this.stroke.points.length >= 1) {
        // Smooth using the midpoint between the previous and current point.
        const mid = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2, pressure: p.pressure };
        this.paintSegment(last, mid);
        this.stroke.lastWorld = mid;
      } else {
        this.paintSegment(last, p);
        this.stroke.lastWorld = p;
      }
      this.stroke.points.push(p);
    } else {
      // Shapes: redraw the preview from scratch each move.
      this.drawShapePreview(p);
    }
    this.requestRender();
  }

  pointerUp() {
    if (!this.stroke) return;
    const t = this.stroke.tool;

    if (this.isPaintTool(t)) {
      if (t === 'eraser') {
        // Eraser already mutated the layer directly during the stroke.
        this.commitHistory();
      } else {
        // Flatten the scratch stroke onto the active layer at stroke opacity.
        const ctx = this.getCtx(this.state.activeLayerId);
        ctx.globalAlpha = this.state.opacity;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.scratch, 0, 0);
        ctx.globalAlpha = 1;
        this.commitHistory();
      }
    } else if (t === 'line' || t === 'rectangle' || t === 'ellipse') {
      const ctx = this.getCtx(this.state.activeLayerId);
      ctx.globalAlpha = this.state.opacity;
      ctx.drawImage(this.scratch, 0, 0);
      ctx.globalAlpha = 1;
      this.commitHistory();
    }

    this.scratchCtx.clearRect(0, 0, this.scratch.width, this.scratch.height);
    this.stroke = null;
    this.setState({ dirty: true });
    this.requestRender();
  }

  /** Abort the current stroke without committing (e.g. a gesture took over). */
  cancelStroke() {
    if (!this.stroke) return;
    this.scratchCtx.clearRect(0, 0, this.scratch.width, this.scratch.height);
    this.stroke = null;
    this.requestRender();
  }

  /** Paint one brush/pencil/eraser segment. */
  private paintSegment(a: Point, b: Point) {
    const s = this.state;
    const tool = this.stroke!.tool;

    if (tool === 'eraser') {
      // Erase directly on the active layer.
      const ctx = this.getCtx(s.activeLayerId);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      this.strokePath(ctx, a, b, tool);
      ctx.restore();
      return;
    }

    // Brush / pencil accumulate on the scratch buffer at full opacity.
    this.scratchCtx.save();
    this.scratchCtx.globalCompositeOperation = 'source-over';
    this.scratchCtx.fillStyle = s.color;
    this.scratchCtx.strokeStyle = s.color;
    this.strokePath(this.scratchCtx, a, b, tool);
    this.scratchCtx.restore();
  }

  private strokePath(ctx: CanvasRenderingContext2D, a: Point, b: Point, tool: ToolId) {
    const size = this.effectiveSize(b.pressure);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    if (tool === 'pencil') {
      // Pencil = hard, aliased-feeling 1px-friendly line.
      ctx.imageSmoothingEnabled = false;
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    // Round dab at the endpoint keeps thick strokes seamless.
    ctx.beginPath();
    ctx.arc(b.x, b.y, size / 2, 0, Math.PI * 2);
    ctx.fillStyle = tool === 'eraser' ? '#000' : ctx.strokeStyle as string;
    ctx.fill();
  }

  /** Draw the live preview for line / rectangle / ellipse onto scratch. */
  private drawShapePreview(p: Point) {
    const s = this.state;
    const st = this.stroke!;
    const ctx = this.scratchCtx;
    ctx.clearRect(0, 0, this.scratch.width, this.scratch.height);
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let { x: ex, y: ey } = p;
    const { x: bx, y: by } = st.startWorld;

    if (st.shift) {
      // Constrain: square / circle / 45° lines.
      if (st.tool === 'line') {
        const dx = ex - bx;
        const dy = ey - by;
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        const len = Math.hypot(dx, dy);
        ex = bx + Math.cos(angle) * len;
        ey = by + Math.sin(angle) * len;
      } else {
        const d = Math.max(Math.abs(ex - bx), Math.abs(ey - by));
        ex = bx + Math.sign(ex - bx || 1) * d;
        ey = by + Math.sign(ey - by || 1) * d;
      }
    }

    if (st.tool === 'line') {
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else if (st.tool === 'rectangle') {
      const x = Math.min(bx, ex);
      const y = Math.min(by, ey);
      const w = Math.abs(ex - bx);
      const h = Math.abs(ey - by);
      ctx.strokeRect(x, y, w, h);
    } else if (st.tool === 'ellipse') {
      const cx = (bx + ex) / 2;
      const cy = (by + ey) / 2;
      const rx = Math.abs(ex - bx) / 2;
      const ry = Math.abs(ey - by) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  private applyFill(x: number, y: number) {
    const s = this.state;
    const layer = s.layers.find((l) => l.id === s.activeLayerId);
    if (layer?.locked) return;
    const ctx = this.getCtx(s.activeLayerId);
    floodFill(ctx, Math.floor(x), Math.floor(y), s.color, s.opacity);
    this.commitHistory();
    this.setState({ dirty: true });
    this.requestRender();
  }

  private pickColor(x: number, y: number) {
    const comp = this.composite(true);
    const ctx = comp.getContext('2d')!;
    const px = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    const hex =
      '#' +
      [px[0], px[1], px[2]]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('');
    this.setColor(hex);
    // Auto-revert to the previous paint tool for a smooth workflow.
    this.setTool(this.state.previousTool === 'eyedropper' ? 'brush' : this.state.previousTool);
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  private makeSnapshot(): HistorySnapshot {
    return {
      width: this.state.canvasWidth,
      height: this.state.canvasHeight,
      background: this.state.background,
      activeLayerId: this.state.activeLayerId,
      layers: this.state.layers.map((meta) => ({
        meta: { ...meta },
        data: this.layerCanvases.get(meta.id)!.toDataURL(),
      })),
    };
  }

  /** Push the current document onto the undo stack. */
  private commitHistory() {
    this.undoStack.push(this.makeSnapshot());
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.setState({ canUndo: this.undoStack.length > 1, canRedo: false });
  }

  /** Seed the baseline snapshot (call once after construction / load). */
  seedHistory() {
    this.undoStack = [this.makeSnapshot()];
    this.redoStack = [];
    this.setState({ canUndo: false, canRedo: false });
  }

  private restore(snap: HistorySnapshot) {
    // Rebuild layer canvases from the snapshot.
    const metas: LayerMeta[] = [];
    const liveIds = new Set(snap.layers.map((l) => l.meta.id));
    for (const id of [...this.layerCanvases.keys()]) {
      if (!liveIds.has(id)) this.layerCanvases.delete(id);
    }
    for (const l of snap.layers) {
      metas.push({ ...l.meta });
      let c = this.layerCanvases.get(l.meta.id);
      if (!c || c.width !== snap.width || c.height !== snap.height) {
        c = createCanvas(snap.width, snap.height);
        this.layerCanvases.set(l.meta.id, c);
      }
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, c!.width, c!.height);
        ctx.drawImage(img, 0, 0);
        this.requestRender();
      };
      img.src = l.data;
    }
    if (this.scratch.width !== snap.width || this.scratch.height !== snap.height) {
      this.scratch = createCanvas(snap.width, snap.height);
      this.scratchCtx = this.scratch.getContext('2d')!;
    }
    this.setState({
      canvasWidth: snap.width,
      canvasHeight: snap.height,
      background: snap.background,
      layers: metas,
      activeLayerId: snap.activeLayerId,
      canUndo: this.undoStack.length > 1,
      canRedo: this.redoStack.length > 0,
    });
    this.requestRender();
  }

  undo() {
    if (this.undoStack.length <= 1) return;
    const current = this.undoStack.pop()!;
    this.redoStack.push(current);
    this.restore(this.undoStack[this.undoStack.length - 1]);
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const snap = this.redoStack.pop()!;
    this.undoStack.push(snap);
    this.restore(snap);
  }

  // ---------------------------------------------------------------------------
  // Tool & option setters
  // ---------------------------------------------------------------------------

  setTool(tool: ToolId) {
    if (tool === this.state.tool) return;
    this.setState({ tool, previousTool: this.state.tool });
    this.requestRender();
  }

  setColor(color: string) {
    const recent = [color, ...this.state.recentColors.filter((c) => c !== color)].slice(
      0,
      MAX_RECENT_COLORS,
    );
    this.setState({ color, recentColors: recent });
  }

  setBackground(background: string) {
    this.setState({ background }, true);
    this.commitHistory();
    this.requestRender();
  }

  setBrushSize(brushSize: number) {
    this.setState({ brushSize: Math.max(1, Math.min(400, brushSize)) });
    this.requestRender();
  }

  setOpacity(opacity: number) {
    this.setState({ opacity: Math.max(0.01, Math.min(1, opacity)) });
  }

  setPressureEnabled(pressureEnabled: boolean) {
    this.setState({ pressureEnabled });
  }

  setSmoothing(smoothing: boolean) {
    this.setState({ smoothing });
  }

  applyPreset(preset: BrushPreset) {
    this.setState({
      tool: preset.tool,
      brushSize: preset.size,
      opacity: preset.opacity,
      pressureEnabled: preset.pressure,
    });
    this.requestRender();
  }

  setGrid(patch: Partial<GridConfig>) {
    this.setState({ grid: { ...this.state.grid, ...patch } });
    this.requestRender();
  }

  setTitle(title: string) {
    this.setState({ title });
  }

  setDescription(description: string) {
    this.setState({ description });
  }

  // ---------------------------------------------------------------------------
  // Layer operations
  // ---------------------------------------------------------------------------

  addLayer() {
    const id = uid('layer-');
    const meta: LayerMeta = {
      id,
      name: `Layer ${this.state.layers.length + 1}`,
      visible: true,
      opacity: 1,
      locked: false,
    };
    this.layerCanvases.set(id, createCanvas(this.state.canvasWidth, this.state.canvasHeight));
    const idx = this.state.layers.findIndex((l) => l.id === this.state.activeLayerId);
    const layers = [...this.state.layers];
    layers.splice(idx + 1, 0, meta);
    this.setState({ layers, activeLayerId: id }, true);
    this.commitHistory();
    this.requestRender();
  }

  removeLayer(id: string) {
    if (this.state.layers.length <= 1) return;
    const idx = this.state.layers.findIndex((l) => l.id === id);
    const layers = this.state.layers.filter((l) => l.id !== id);
    this.layerCanvases.delete(id);
    const activeLayerId =
      this.state.activeLayerId === id
        ? layers[Math.max(0, idx - 1)].id
        : this.state.activeLayerId;
    this.setState({ layers, activeLayerId }, true);
    this.commitHistory();
    this.requestRender();
  }

  duplicateLayer(id: string) {
    const src = this.layerCanvases.get(id);
    const srcMeta = this.state.layers.find((l) => l.id === id);
    if (!src || !srcMeta) return;
    const newId = uid('layer-');
    const c = createCanvas(this.state.canvasWidth, this.state.canvasHeight);
    c.getContext('2d')!.drawImage(src, 0, 0);
    this.layerCanvases.set(newId, c);
    const meta: LayerMeta = { ...srcMeta, id: newId, name: `${srcMeta.name} copy` };
    const idx = this.state.layers.findIndex((l) => l.id === id);
    const layers = [...this.state.layers];
    layers.splice(idx + 1, 0, meta);
    this.setState({ layers, activeLayerId: newId }, true);
    this.commitHistory();
    this.requestRender();
  }

  setActiveLayer(id: string) {
    this.setState({ activeLayerId: id });
  }

  updateLayer(id: string, patch: Partial<LayerMeta>) {
    const layers = this.state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l));
    this.setState({ layers }, true);
    this.requestRender();
  }

  /** Move a layer up (toward the front) or down in the stack. */
  moveLayer(id: string, dir: -1 | 1) {
    const layers = [...this.state.layers];
    const idx = layers.findIndex((l) => l.id === id);
    const target = idx + dir;
    if (target < 0 || target >= layers.length) return;
    [layers[idx], layers[target]] = [layers[target], layers[idx]];
    this.setState({ layers }, true);
    this.commitHistory();
    this.requestRender();
  }

  clearLayer(id?: string) {
    const target = id ?? this.state.activeLayerId;
    const ctx = this.getCtx(target);
    ctx.clearRect(0, 0, this.state.canvasWidth, this.state.canvasHeight);
    this.commitHistory();
    this.setState({ dirty: true });
    this.requestRender();
  }

  clearCanvas() {
    for (const c of this.layerCanvases.values()) {
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    }
    this.commitHistory();
    this.setState({ dirty: true });
    this.requestRender();
  }

  // ---------------------------------------------------------------------------
  // Viewport: zoom / pan / fit
  // ---------------------------------------------------------------------------

  setZoom(zoom: number) {
    this.zoomAt(this.viewW / 2, this.viewH / 2, zoom / this.state.zoom);
  }

  /** Zoom by `factor` keeping the point under (sx, sy) stationary. */
  zoomAt(sx: number, sy: number, factor: number) {
    const s = this.state;
    const newZoom = Math.max(0.05, Math.min(32, s.zoom * factor));
    const k = newZoom / s.zoom;
    // Keep the world point under the cursor fixed.
    const panX = sx - (sx - s.panX) * k;
    const panY = sy - (sy - s.panY) * k;
    this.setState({ zoom: newZoom, panX, panY });
    this.requestRender();
  }

  panBy(dx: number, dy: number) {
    this.setState({ panX: this.state.panX + dx, panY: this.state.panY + dy });
    this.requestRender();
  }

  /** Centre & scale the document to nicely fit the current viewport. */
  fitToScreen(padding = 64) {
    if (!this.viewW || !this.viewH) return;
    const s = this.state;
    const zoom = Math.min(
      (this.viewW - padding) / s.canvasWidth,
      (this.viewH - padding) / s.canvasHeight,
    );
    const z = Math.max(0.05, Math.min(8, zoom));
    const panX = (this.viewW - s.canvasWidth * z) / 2;
    const panY = (this.viewH - s.canvasHeight * z) / 2;
    this.setState({ zoom: z, panX, panY });
    this.requestRender();
  }

  resetZoom() {
    const s = this.state;
    const panX = (this.viewW - s.canvasWidth) / 2;
    const panY = (this.viewH - s.canvasHeight) / 2;
    this.setState({ zoom: 1, panX, panY });
    this.requestRender();
  }

  // ---------------------------------------------------------------------------
  // Document resize
  // ---------------------------------------------------------------------------

  resizeDocument(width: number, height: number, anchor: 'topleft' | 'center' = 'topleft') {
    width = Math.max(16, Math.round(width));
    height = Math.max(16, Math.round(height));
    const offX = anchor === 'center' ? Math.round((width - this.state.canvasWidth) / 2) : 0;
    const offY = anchor === 'center' ? Math.round((height - this.state.canvasHeight) / 2) : 0;
    for (const [id, c] of this.layerCanvases) {
      const next = createCanvas(width, height);
      next.getContext('2d')!.drawImage(c, offX, offY);
      this.layerCanvases.set(id, next);
    }
    this.scratch = createCanvas(width, height);
    this.scratchCtx = this.scratch.getContext('2d')!;
    this.setState({ canvasWidth: width, canvasHeight: height }, true);
    this.commitHistory();
    this.fitToScreen();
  }

  // ---------------------------------------------------------------------------
  // Serialization (save / load / share)
  // ---------------------------------------------------------------------------

  serialize(): SavedDrawing {
    const layers: SerializedLayer[] = this.state.layers.map((meta) => ({
      id: meta.id,
      name: meta.name,
      visible: meta.visible,
      opacity: meta.opacity,
      locked: meta.locked,
      data: this.layerCanvases.get(meta.id)!.toDataURL('image/png'),
    }));
    return {
      id: uid('art-'),
      title: this.state.title,
      description: this.state.description,
      width: this.state.canvasWidth,
      height: this.state.canvasHeight,
      background: this.state.background,
      thumbnail: this.exportDataURL('image/jpeg', 0.7, 480),
      layers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /** Replace the whole document with a saved/loaded drawing. */
  async load(drawing: SavedDrawing) {
    const metas: LayerMeta[] = [];
    this.layerCanvases.clear();
    await Promise.all(
      drawing.layers.map(
        (l) =>
          new Promise<void>((resolve) => {
            const c = createCanvas(drawing.width, drawing.height);
            const ctx = c.getContext('2d')!;
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 0, 0);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = l.data;
            this.layerCanvases.set(l.id, c);
            metas.push({
              id: l.id,
              name: l.name,
              visible: l.visible,
              opacity: l.opacity,
              locked: l.locked,
            });
          }),
      ),
    );
    this.scratch = createCanvas(drawing.width, drawing.height);
    this.scratchCtx = this.scratch.getContext('2d')!;
    this.setState({
      canvasWidth: drawing.width,
      canvasHeight: drawing.height,
      background: drawing.background,
      title: drawing.title,
      description: drawing.description,
      layers: metas,
      activeLayerId: metas[0]?.id ?? '',
      dirty: false,
    });
    this.seedHistory();
    this.fitToScreen();
  }

  /** Start a fresh empty document. */
  reset(width = 1280, height = 800, background = '#ffffff') {
    this.layerCanvases.clear();
    const base = defaultState(width, height);
    base.background = background;
    this.layerCanvases.set(base.layers[0].id, createCanvas(width, height));
    this.scratch = createCanvas(width, height);
    this.scratchCtx = this.scratch.getContext('2d')!;
    // Preserve user tool preferences across "new" documents.
    this.state = {
      ...base,
      tool: this.state.tool,
      color: this.state.color,
      brushSize: this.state.brushSize,
      opacity: this.state.opacity,
      pressureEnabled: this.state.pressureEnabled,
      smoothing: this.state.smoothing,
      recentColors: this.state.recentColors,
      swatches: this.state.swatches,
      presets: this.state.presets,
    };
    this.emit();
    this.seedHistory();
    this.fitToScreen();
  }

  // ---------------------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------------------

  /**
   * Render a composited export. `scale` multiplies the resolution for
   * high-resolution output. `maxWidth` (optional) caps the longest edge.
   */
  exportCanvas(opts: { scale?: number; background?: boolean; maxWidth?: number } = {}): HTMLCanvasElement {
    const { scale = 1, background = true, maxWidth } = opts;
    const base = this.composite(background);
    let targetW = base.width * scale;
    let targetH = base.height * scale;
    if (maxWidth && Math.max(targetW, targetH) > maxWidth) {
      const ratio = maxWidth / Math.max(targetW, targetH);
      targetW *= ratio;
      targetH *= ratio;
    }
    if (targetW === base.width && targetH === base.height) return base;
    const out = createCanvas(Math.round(targetW), Math.round(targetH));
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(base, 0, 0, out.width, out.height);
    return out;
  }

  exportDataURL(type: 'image/png' | 'image/jpeg', quality = 0.92, maxWidth?: number, scale = 1): string {
    // JPEG has no alpha — always include the background.
    const background = type === 'image/jpeg';
    return this.exportCanvas({ scale, background, maxWidth }).toDataURL(type, quality);
  }

  getState() {
    return this.state;
  }
}
