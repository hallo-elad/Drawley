// Shared type definitions for Drawley.

/** Available tools in the toolbox. */
export type ToolId =
  | 'brush'
  | 'pencil'
  | 'eraser'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'fill'
  | 'text'
  | 'select'
  | 'lasso'
  | 'move'
  | 'pan'
  | 'eyedropper';

export type ColorTheme = 'dark' | 'light';

/** Axis-aligned bounding box of the active selection, in world coordinates. */
export interface SelectionInfo {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A single animation frame as surfaced to the UI (pixels live in the engine). */
export interface FrameInfo {
  id: string;
  /** PNG data URL preview, refreshed when the frame is edited / switched away. */
  thumb: string;
}

/** How shapes (rectangle / ellipse) are painted. */
export type ShapeMode = 'stroke' | 'fill' | 'both';

/**
 * Layer blend mode. Maps directly to canvas `globalCompositeOperation`
 * (with 'normal' mapped to 'source-over').
 */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/** A point in canvas (world) coordinates. */
export interface Point {
  x: number;
  y: number;
  /** Normalised pressure 0..1 (1 when the input device has no pressure). */
  pressure: number;
}

/** Metadata describing a layer. The actual pixels live in the engine. */
export interface LayerMeta {
  id: string;
  name: string;
  visible: boolean;
  /** 0..1 layer opacity used when compositing. */
  opacity: number;
  locked: boolean;
  /** Compositing blend mode. */
  blendMode: BlendMode;
}

/** A reusable brush preset shown in the tool options. */
export interface BrushPreset {
  id: string;
  name: string;
  tool: ToolId;
  size: number;
  opacity: number;
  /** Whether the preset reacts to pointer pressure. */
  pressure: boolean;
}

/** Grid / snapping configuration. */
export interface GridConfig {
  show: boolean;
  size: number;
  snap: boolean;
}

/**
 * Immutable snapshot of all UI-relevant engine state.
 * Heavy pixel data (layer canvases) is intentionally NOT part of this object so
 * that React re-renders stay cheap — only metadata changes trigger updates.
 */
export interface EngineState {
  tool: ToolId;
  previousTool: ToolId;
  color: string;
  /** Background / canvas fill colour. */
  background: string;
  brushSize: number;
  /** 0..1 stroke opacity. */
  opacity: number;
  hardness: number;
  pressureEnabled: boolean;
  smoothing: boolean;

  /** How rectangle / ellipse shapes are painted. */
  shapeMode: ShapeMode;
  /** Font settings for the text tool. */
  fontSize: number;
  fontFamily: string;

  layers: LayerMeta[];
  activeLayerId: string;

  zoom: number;
  panX: number;
  panY: number;

  canvasWidth: number;
  canvasHeight: number;

  grid: GridConfig;

  recentColors: string[];
  swatches: string[];
  presets: BrushPreset[];

  /** Bounding box of the current selection, or null when nothing is selected. */
  selection: SelectionInfo | null;
  /** Whether a floating selection (cut/pasted pixels) is being moved. */
  floating: boolean;
  /** Whether the internal clipboard holds pixels available to paste. */
  hasClipboard: boolean;

  /** Animation frames in playback order. */
  frames: FrameInfo[];
  activeFrameId: string;
  /** Whether the animation is currently playing back. */
  playing: boolean;
  /** Playback speed in frames per second. */
  fps: number;
  /** Whether onion-skinning (ghosts of adjacent frames) is shown. */
  onionSkin: boolean;

  canUndo: boolean;
  canRedo: boolean;

  /** Title / description used when saving & sharing. */
  title: string;
  description: string;

  dirty: boolean;
}

/** A drawing persisted to local storage or encoded into a share link. */
export interface SavedDrawing {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  background: string;
  /** Composited PNG data URL used for thumbnails & gallery previews. */
  thumbnail: string;
  /** Per-layer serialised data (PNG data URLs + metadata). */
  layers: SerializedLayer[];
  createdAt: number;
  updatedAt: number;
}

export interface SerializedLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
  blendMode?: BlendMode;
  /** PNG data URL of the layer pixels. */
  data: string;
}
