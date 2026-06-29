import type {
  BlendMode,
  BrushPreset,
  EngineState,
  GridConfig,
  LayerMeta,
  Point,
  SavedDrawing,
  SelectionInfo,
  SerializedLayer,
  ShapeMode,
  ToolId,
} from '../types';

/** Map a layer blend mode to a canvas composite operation. */
function blendOp(mode: BlendMode): GlobalCompositeOperation {
  return mode === 'normal' ? 'source-over' : (mode as GlobalCompositeOperation);
}
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
    blendMode: 'normal',
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
    shapeMode: 'stroke',
    fontSize: 48,
    fontFamily: 'Inter, system-ui, sans-serif',
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
    selection: null,
    floating: false,
    hasClipboard: false,
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

  // --- Selection / floating / clipboard -------------------------------------
  /** Committed selection outline as a world-space polygon (null = no selection). */
  private selPath: { x: number; y: number }[] | null = null;
  /** In-progress selection being dragged out by the select/lasso tools. */
  private selDraft: { kind: 'select' | 'lasso'; pts: { x: number; y: number }[] } | null = null;
  /** Floating pixels lifted from the active layer (for move / paste). */
  private float: { canvas: HTMLCanvasElement; x: number; y: number } | null = null;
  /** Drag anchor while moving a floating selection. */
  private moveAnchor: { px: number; py: number; ox: number; oy: number } | null = null;
  /** Internal pixel clipboard. */
  private clipboard: HTMLCanvasElement | null = null;

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
    // Keep redrawing while a selection exists so the marching ants animate.
    if (this.selPath || this.selDraft || this.float) this.needsRender = true;
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
      ctx.globalCompositeOperation = blendOp(layer.blendMode ?? 'normal');
      ctx.drawImage(c, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
      ctx.globalCompositeOperation = blendOp(layer.blendMode ?? 'normal');
      ctx.drawImage(c, 0, 0);
      if (this.stroke && layer.id === s.activeLayerId) {
        // Eraser previews are applied directly to the layer, so only paint
        // scratch for additive tools.
        ctx.globalAlpha = layer.opacity * (this.stroke.tool === 'eraser' ? 1 : s.opacity);
        if (this.stroke.tool !== 'eraser') ctx.drawImage(this.scratch, 0, 0);
      }
      // Floating selection rides above its source (active) layer.
      if (this.float && layer.id === s.activeLayerId) {
        ctx.globalAlpha = layer.opacity;
        ctx.drawImage(this.float.canvas, this.float.x, this.float.y);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (s.grid.show) this.drawGrid(ctx);

    // Document border.
    ctx.lineWidth = 1 / s.zoom;
    ctx.strokeStyle = 'rgba(128,128,128,0.5)';
    ctx.strokeRect(0, 0, s.canvasWidth, s.canvasHeight);

    this.drawSelectionOverlay(ctx);

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

  /** Convert a world-space point to viewport (CSS px) coordinates. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const s = this.state;
    return { x: wx * s.zoom + s.panX, y: wy * s.zoom + s.panY };
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
    if (s.tool === 'text') {
      // Text placement is driven by an overlay input in CanvasStage; the engine
      // only commits the result. Ignore the raw pointer here.
      return;
    }
    if (s.tool === 'select' || s.tool === 'lasso') {
      const u = this.screenToWorld(sx, sy);
      this.beginSelDraft(s.tool === 'select' ? 'select' : 'lasso', u.x, u.y);
      return;
    }
    if (s.tool === 'move') {
      const u = this.screenToWorld(sx, sy);
      this.beginMove(u.x, u.y);
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
    if (this.selDraft) {
      const u = this.screenToWorld(sx, sy);
      this.updateSelDraft(u.x, u.y);
      return;
    }
    if (this.moveAnchor) {
      const u = this.screenToWorld(sx, sy);
      this.updateMove(u.x, u.y);
      return;
    }
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
    if (this.selDraft) {
      this.endSelDraft();
      return;
    }
    if (this.moveAnchor) {
      this.moveAnchor = null;
      return;
    }
    if (!this.stroke) return;
    const t = this.stroke.tool;

    if (this.isPaintTool(t)) {
      if (t === 'eraser') {
        // Eraser already mutated the layer directly during the stroke.
        this.commitHistory();
      } else {
        // Flatten the scratch stroke onto the active layer at stroke opacity.
        const ctx = this.getCtx(this.state.activeLayerId);
        ctx.save();
        this.clipToSelection(ctx);
        ctx.globalAlpha = this.state.opacity;
        ctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(this.scratch, 0, 0);
        ctx.restore();
        this.commitHistory();
      }
    } else if (t === 'line' || t === 'rectangle' || t === 'ellipse') {
      const ctx = this.getCtx(this.state.activeLayerId);
      ctx.save();
      this.clipToSelection(ctx);
      ctx.globalAlpha = this.state.opacity;
      ctx.drawImage(this.scratch, 0, 0);
      ctx.restore();
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
      this.clipToSelection(ctx);
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
    } else if (tool === 'brush') {
      // Soft brushes feather their edge with a blur proportional to hardness.
      const hardness = this.state.hardness;
      if (hardness < 1) ctx.filter = `blur(${(1 - hardness) * size * 0.35}px)`;
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

    const mode = s.shapeMode;
    const doFill = mode === 'fill' || mode === 'both';
    const doStroke = mode === 'stroke' || mode === 'both';

    if (st.tool === 'line') {
      // A line has no interior; always stroke.
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    } else if (st.tool === 'rectangle') {
      const x = Math.min(bx, ex);
      const y = Math.min(by, ey);
      const w = Math.abs(ex - bx);
      const h = Math.abs(ey - by);
      if (doFill) ctx.fillRect(x, y, w, h);
      if (doStroke) ctx.strokeRect(x, y, w, h);
    } else if (st.tool === 'ellipse') {
      const cx = (bx + ex) / 2;
      const cy = (by + ey) / 2;
      const rx = Math.abs(ex - bx) / 2;
      const ry = Math.abs(ey - by) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      if (doFill) ctx.fill();
      if (doStroke) ctx.stroke();
    }
    ctx.restore();
  }

  private applyFill(x: number, y: number) {
    const s = this.state;
    const layer = s.layers.find((l) => l.id === s.activeLayerId);
    if (layer?.locked) return;
    const ctx = this.getCtx(s.activeLayerId);
    if (this.selPath) {
      // Flood a working copy, then composite the result back clipped to the
      // selection so the fill cannot bleed past the marquee.
      const tmp = createCanvas(s.canvasWidth, s.canvasHeight);
      const tctx = tmp.getContext('2d')!;
      tctx.drawImage(this.layerCanvases.get(s.activeLayerId)!, 0, 0);
      floodFill(tctx, Math.floor(x), Math.floor(y), s.color, s.opacity);
      ctx.save();
      this.clipToSelection(ctx);
      ctx.drawImage(tmp, 0, 0);
      ctx.restore();
    } else {
      floodFill(ctx, Math.floor(x), Math.floor(y), s.color, s.opacity);
    }
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

  /** Sample the composited colour at a world point without switching tools. */
  sampleColorAt(sx: number, sy: number) {
    const w = this.screenToWorld(sx, sy);
    const comp = this.composite(true);
    const ctx = comp.getContext('2d')!;
    const x = Math.floor(w.x);
    const y = Math.floor(w.y);
    if (x < 0 || y < 0 || x >= comp.width || y >= comp.height) return;
    const px = ctx.getImageData(x, y, 1, 1).data;
    const hex =
      '#' +
      [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('');
    this.setColor(hex);
  }

  /** Rasterise text onto the active layer at the given world point. */
  commitText(worldX: number, worldY: number, text: string) {
    const value = text.trim();
    if (!value) return;
    const s = this.state;
    const layer = s.layers.find((l) => l.id === s.activeLayerId);
    if (layer?.locked) return;
    const ctx = this.getCtx(s.activeLayerId);
    ctx.save();
    ctx.globalAlpha = s.opacity;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'top';
    ctx.font = `${s.fontSize}px ${s.fontFamily}`;
    // Support multi-line input.
    const lineHeight = s.fontSize * 1.2;
    value.split('\n').forEach((line, i) => {
      ctx.fillText(line, worldX, worldY + i * lineHeight);
    });
    ctx.restore();
    this.commitHistory();
    this.setState({ dirty: true });
    this.requestRender();
  }

  // ---------------------------------------------------------------------------
  // Selection, floating pixels, clipboard & transforms
  // ---------------------------------------------------------------------------

  private buildPolyPath(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  }

  private bboxOf(pts: { x: number; y: number }[]): SelectionInfo {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** Push the current selection/clipboard status into React state. */
  private syncSelectionState() {
    let sel: SelectionInfo | null = null;
    if (this.float) {
      sel = { x: this.float.x, y: this.float.y, w: this.float.canvas.width, h: this.float.canvas.height };
    } else if (this.selPath) {
      const b = this.bboxOf(this.selPath);
      sel = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) };
    }
    this.setState({ selection: sel, floating: !!this.float, hasClipboard: !!this.clipboard });
  }

  /** Animated marching-ants outline for the selection / floating bounds. */
  private drawSelectionOverlay(ctx: CanvasRenderingContext2D) {
    const s = this.state;
    let pts = this.selDraft?.pts ?? this.selPath;
    if (this.float) {
      const f = this.float;
      pts = [
        { x: f.x, y: f.y },
        { x: f.x + f.canvas.width, y: f.y },
        { x: f.x + f.canvas.width, y: f.y + f.canvas.height },
        { x: f.x, y: f.y + f.canvas.height },
      ];
    }
    if (!pts || pts.length < 2) return;
    const dash = 5 / s.zoom;
    const offset = (Date.now() / 60) % (dash * 2);
    ctx.save();
    ctx.lineWidth = 1 / s.zoom;
    this.buildPolyPath(ctx, pts);
    ctx.setLineDash([dash, dash]);
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineDashOffset = -offset;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineDashOffset = -offset + dash;
    ctx.stroke();
    ctx.restore();
  }

  /** Clip the given layer context to the committed selection (no-op if none). */
  private clipToSelection(ctx: CanvasRenderingContext2D) {
    if (!this.selPath) return;
    this.buildPolyPath(ctx, this.selPath);
    ctx.clip();
  }

  hasSelection(): boolean {
    return !!this.selPath || !!this.float;
  }

  // --- Selection drafting (driven by the select / lasso tools) --------------

  private beginSelDraft(kind: 'select' | 'lasso', wx: number, wy: number) {
    this.commitFloat();
    this.selDraft = { kind, pts: [{ x: wx, y: wy }] };
    this.requestRender();
  }

  private updateSelDraft(wx: number, wy: number) {
    if (!this.selDraft) return;
    if (this.selDraft.kind === 'select') {
      const a = this.selDraft.pts[0];
      this.selDraft.pts = [a, { x: wx, y: a.y }, { x: wx, y: wy }, { x: a.x, y: wy }];
    } else {
      this.selDraft.pts.push({ x: wx, y: wy });
    }
    this.requestRender();
  }

  private endSelDraft() {
    const d = this.selDraft;
    this.selDraft = null;
    if (!d) return;
    const b = this.bboxOf(d.pts);
    // A tiny drag is treated as a click-to-deselect.
    this.selPath = b.w < 2 || b.h < 2 ? null : d.pts;
    this.syncSelectionState();
    this.requestRender();
  }

  // --- Floating pixels ------------------------------------------------------

  /** Lift the selected region from the active layer into a floating buffer. */
  private floatFromSelection() {
    if (!this.selPath) return;
    const layer = this.state.layers.find((l) => l.id === this.state.activeLayerId);
    if (layer?.locked) return;
    const b = this.bboxOf(this.selPath);
    const x = Math.floor(b.x), y = Math.floor(b.y);
    const w = Math.ceil(b.w), h = Math.ceil(b.h);
    if (w <= 0 || h <= 0) return;
    const src = this.layerCanvases.get(this.state.activeLayerId)!;
    const buf = createCanvas(w, h);
    const bctx = buf.getContext('2d')!;
    bctx.save();
    bctx.translate(-x, -y);
    this.buildPolyPath(bctx, this.selPath);
    bctx.clip();
    bctx.drawImage(src, 0, 0);
    bctx.restore();
    // Erase the lifted region from the source layer.
    const lctx = this.getCtx(this.state.activeLayerId);
    lctx.save();
    lctx.globalCompositeOperation = 'destination-out';
    this.buildPolyPath(lctx, this.selPath);
    lctx.fill();
    lctx.restore();
    this.float = { canvas: buf, x, y };
    this.selPath = null;
    this.syncSelectionState();
  }

  /** Lift the entire active layer (move tool with no active selection). */
  private floatWholeLayer() {
    const layer = this.state.layers.find((l) => l.id === this.state.activeLayerId);
    if (layer?.locked) return;
    const src = this.layerCanvases.get(this.state.activeLayerId)!;
    const buf = createCanvas(src.width, src.height);
    buf.getContext('2d')!.drawImage(src, 0, 0);
    this.getCtx(this.state.activeLayerId).clearRect(0, 0, src.width, src.height);
    this.float = { canvas: buf, x: 0, y: 0 };
    this.syncSelectionState();
  }

  /** Stamp the floating buffer back down onto the active layer. */
  commitFloat() {
    if (!this.float) return;
    const f = this.float;
    this.float = null;
    this.moveAnchor = null;
    const layer = this.state.layers.find((l) => l.id === this.state.activeLayerId);
    if (!layer?.locked) {
      this.getCtx(this.state.activeLayerId).drawImage(f.canvas, f.x, f.y);
    }
    this.commitHistory();
    this.setState({ dirty: true });
    this.syncSelectionState();
    this.requestRender();
  }

  private beginMove(wx: number, wy: number) {
    if (!this.float) {
      if (this.selPath) this.floatFromSelection();
      else this.floatWholeLayer();
    }
    if (this.float) {
      this.moveAnchor = { px: wx, py: wy, ox: this.float.x, oy: this.float.y };
    }
  }

  private updateMove(wx: number, wy: number) {
    if (!this.moveAnchor || !this.float) return;
    this.float.x = Math.round(this.moveAnchor.ox + (wx - this.moveAnchor.px));
    this.float.y = Math.round(this.moveAnchor.oy + (wy - this.moveAnchor.py));
    this.syncSelectionState();
    this.requestRender();
  }

  // --- Selection commands (public) ------------------------------------------

  selectAll() {
    this.commitFloat();
    const w = this.state.canvasWidth, h = this.state.canvasHeight;
    this.selPath = [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    this.syncSelectionState();
    this.requestRender();
  }

  deselect() {
    this.commitFloat();
    this.selPath = null;
    this.selDraft = null;
    this.syncSelectionState();
    this.requestRender();
  }

  /** Extract the selected pixels (floating or from the active layer). */
  private extractSelectionCanvas(): HTMLCanvasElement | null {
    if (this.float) {
      const c = createCanvas(this.float.canvas.width, this.float.canvas.height);
      c.getContext('2d')!.drawImage(this.float.canvas, 0, 0);
      return c;
    }
    if (!this.selPath) return null;
    const b = this.bboxOf(this.selPath);
    const x = Math.floor(b.x), y = Math.floor(b.y);
    const w = Math.ceil(b.w), h = Math.ceil(b.h);
    if (w <= 0 || h <= 0) return null;
    const src = this.layerCanvases.get(this.state.activeLayerId)!;
    const buf = createCanvas(w, h);
    const bctx = buf.getContext('2d')!;
    bctx.save();
    bctx.translate(-x, -y);
    this.buildPolyPath(bctx, this.selPath);
    bctx.clip();
    bctx.drawImage(src, 0, 0);
    bctx.restore();
    return buf;
  }

  copySelection() {
    const buf = this.extractSelectionCanvas();
    if (!buf) return;
    this.clipboard = buf;
    this.setState({ hasClipboard: true });
  }

  cutSelection() {
    this.copySelection();
    this.deleteSelection();
  }

  /** Drop the clipboard pixels in as a new floating selection (centred). */
  paste() {
    if (!this.clipboard) return;
    this.commitFloat();
    const c = createCanvas(this.clipboard.width, this.clipboard.height);
    c.getContext('2d')!.drawImage(this.clipboard, 0, 0);
    const x = Math.round((this.state.canvasWidth - c.width) / 2);
    const y = Math.round((this.state.canvasHeight - c.height) / 2);
    this.float = { canvas: c, x, y };
    this.selPath = null;
    this.setState({ tool: 'move', previousTool: this.state.tool });
    this.syncSelectionState();
    this.requestRender();
  }

  duplicateSelection() {
    const buf = this.extractSelectionCanvas();
    if (!buf) return;
    const sel = this.state.selection;
    this.commitFloat();
    const c = createCanvas(buf.width, buf.height);
    c.getContext('2d')!.drawImage(buf, 0, 0);
    this.float = { canvas: c, x: (sel?.x ?? 0) + 12, y: (sel?.y ?? 0) + 12 };
    this.selPath = null;
    this.setState({ tool: 'move', previousTool: this.state.tool });
    this.syncSelectionState();
    this.requestRender();
  }

  /** Delete the floating pixels, the selected region, or clear the layer. */
  deleteSelection() {
    if (this.float) {
      this.float = null;
      this.moveAnchor = null;
      this.commitHistory();
      this.setState({ dirty: true });
      this.syncSelectionState();
      this.requestRender();
      return;
    }
    if (!this.selPath) {
      this.clearLayer();
      return;
    }
    const layer = this.state.layers.find((l) => l.id === this.state.activeLayerId);
    if (layer?.locked) return;
    const ctx = this.getCtx(this.state.activeLayerId);
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    this.buildPolyPath(ctx, this.selPath);
    ctx.fill();
    ctx.restore();
    this.commitHistory();
    this.setState({ dirty: true });
    this.requestRender();
  }

  // --- Flip & rotate --------------------------------------------------------

  private flipBuffer(c: HTMLCanvasElement, axis: 'h' | 'v'): HTMLCanvasElement {
    const out = createCanvas(c.width, c.height);
    const ctx = out.getContext('2d')!;
    ctx.translate(axis === 'h' ? c.width : 0, axis === 'v' ? c.height : 0);
    ctx.scale(axis === 'h' ? -1 : 1, axis === 'v' ? -1 : 1);
    ctx.drawImage(c, 0, 0);
    return out;
  }

  private rotateBuffer(c: HTMLCanvasElement, dir: -1 | 1): HTMLCanvasElement {
    const out = createCanvas(c.height, c.width);
    const ctx = out.getContext('2d')!;
    if (dir > 0) {
      ctx.translate(c.height, 0);
      ctx.rotate(Math.PI / 2);
    } else {
      ctx.translate(0, c.width);
      ctx.rotate(-Math.PI / 2);
    }
    ctx.drawImage(c, 0, 0);
    return out;
  }

  /** Flip the floating/selected pixels, or the whole document if none. */
  flip(axis: 'h' | 'v') {
    if (this.float) {
      this.float.canvas = this.flipBuffer(this.float.canvas, axis);
      this.requestRender();
      return;
    }
    if (this.selPath) {
      this.floatFromSelection();
      const f = this.float as { canvas: HTMLCanvasElement; x: number; y: number } | null;
      if (f) f.canvas = this.flipBuffer(f.canvas, axis);
      this.requestRender();
      return;
    }
    for (const [, c] of this.layerCanvases) {
      const out = this.flipBuffer(c, axis);
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(out, 0, 0);
    }
    this.commitHistory();
    this.setState({ dirty: true });
    this.requestRender();
  }

  /** Rotate the floating/selected pixels 90°, or the whole document if none. */
  rotate(dir: -1 | 1) {
    if (!this.float && !this.selPath) {
      this.rotateDocument(dir);
      return;
    }
    if (!this.float && this.selPath) this.floatFromSelection();
    if (this.float) {
      const old = this.float.canvas;
      const cx = this.float.x + old.width / 2;
      const cy = this.float.y + old.height / 2;
      const nc = this.rotateBuffer(old, dir);
      this.float.canvas = nc;
      this.float.x = Math.round(cx - nc.width / 2);
      this.float.y = Math.round(cy - nc.height / 2);
      this.syncSelectionState();
      this.requestRender();
    }
  }

  /** Rotate the entire document 90°, swapping its dimensions. */
  rotateDocument(dir: -1 | 1) {
    this.commitFloat();
    const w = this.state.canvasWidth, h = this.state.canvasHeight;
    for (const [id, c] of this.layerCanvases) {
      this.layerCanvases.set(id, this.rotateBuffer(c, dir));
    }
    this.scratch = createCanvas(h, w);
    this.scratchCtx = this.scratch.getContext('2d')!;
    this.selPath = null;
    this.setState({ canvasWidth: h, canvasHeight: w }, true);
    this.commitHistory();
    this.fitToScreen();
    this.syncSelectionState();
  }

  // --- Image import ---------------------------------------------------------

  /** Add an image as a new layer, scaled to fit and centred. */
  addImageLayer(img: HTMLImageElement | HTMLCanvasElement, name = 'Image') {
    this.commitFloat();
    const id = uid('layer-');
    const { canvasWidth: cw, canvasHeight: ch } = this.state;
    const c = createCanvas(cw, ch);
    const ctx = c.getContext('2d')!;
    const iw = (img as HTMLImageElement).naturalWidth || img.width;
    const ih = (img as HTMLImageElement).naturalHeight || img.height;
    const scale = Math.min(1, cw / iw, ch / ih);
    const dw = iw * scale, dh = ih * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    this.layerCanvases.set(id, c);
    const meta: LayerMeta = { id, name, visible: true, opacity: 1, locked: false, blendMode: 'normal' };
    const idx = this.state.layers.findIndex((l) => l.id === this.state.activeLayerId);
    const layers = [...this.state.layers];
    layers.splice(idx + 1, 0, meta);
    this.setState({ layers, activeLayerId: id }, true);
    this.commitHistory();
    this.requestRender();
  }

  /** Load an image from a data URL / object URL and add it as a layer. */
  addImageFromSource(src: string, name = 'Image'): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        this.addImageLayer(img, name);
        resolve();
      };
      img.onerror = () => resolve();
      img.src = src;
    });
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
    // A restored snapshot invalidates any live selection / floating pixels.
    this.selPath = null;
    this.selDraft = null;
    this.float = null;
    this.moveAnchor = null;
    this.setState({
      canvasWidth: snap.width,
      canvasHeight: snap.height,
      background: snap.background,
      layers: metas,
      activeLayerId: snap.activeLayerId,
      selection: null,
      floating: false,
      canUndo: this.undoStack.length > 1,
      canRedo: this.redoStack.length > 0,
    });
    this.requestRender();
  }

  undo() {
    // A floating selection is committed first so the move becomes undoable.
    if (this.float) this.commitFloat();
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
    // Stamp any floating selection when switching away from the move tool.
    if (this.float && tool !== 'move') this.commitFloat();
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

  setHardness(hardness: number) {
    this.setState({ hardness: Math.max(0, Math.min(1, hardness)) });
    this.requestRender();
  }

  setShapeMode(shapeMode: ShapeMode) {
    this.setState({ shapeMode });
  }

  setFontSize(fontSize: number) {
    this.setState({ fontSize: Math.max(4, Math.min(400, fontSize)) });
  }

  setFontFamily(fontFamily: string) {
    this.setState({ fontFamily });
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
      blendMode: 'normal',
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
    this.commitFloat();
    this.selPath = null;
    this.float = null;
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
    this.commitFloat();
    const layers: SerializedLayer[] = this.state.layers.map((meta) => ({
      id: meta.id,
      name: meta.name,
      visible: meta.visible,
      opacity: meta.opacity,
      locked: meta.locked,
      blendMode: meta.blendMode ?? 'normal',
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
    this.selPath = null;
    this.selDraft = null;
    this.float = null;
    this.moveAnchor = null;
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
              blendMode: l.blendMode ?? 'normal',
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
    this.selPath = null;
    this.selDraft = null;
    this.float = null;
    this.moveAnchor = null;
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
    this.commitFloat();
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
