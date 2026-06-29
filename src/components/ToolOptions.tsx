import { Slider } from './ui/Slider';
import { useEngine, useEngineState } from '../hooks/useEngine';
import type { BrushPreset, ShapeMode } from '../types';
import './ToolOptions.css';

const SHAPE_MODES: { id: ShapeMode; label: string }[] = [
  { id: 'stroke', label: 'Stroke' },
  { id: 'fill', label: 'Fill' },
  { id: 'both', label: 'Both' },
];

const FONT_FAMILIES = [
  { value: 'Inter, system-ui, sans-serif', label: 'Sans' },
  { value: 'Georgia, "Times New Roman", serif', label: 'Serif' },
  { value: '"Courier New", monospace', label: 'Mono' },
  { value: '"Comic Sans MS", "Marker Felt", cursive', label: 'Casual' },
];

/** Contextual options for the active tool: size, opacity, presets, dynamics. */
export function ToolOptions() {
  const engine = useEngine();
  const state = useEngineState();

  const isText = state.tool === 'text';
  const isShape = state.tool === 'rectangle' || state.tool === 'ellipse';
  const showOpacity = state.tool !== 'eraser' && state.tool !== 'pan' && state.tool !== 'eyedropper';
  const showDynamics = state.tool === 'brush' || state.tool === 'pencil';
  const showSize = !isText;

  return (
    <div className="tool-options">
      {showSize && (
        <Slider
          label="Brush Size"
          min={1}
          max={200}
          value={state.brushSize}
          onChange={(v) => engine.setBrushSize(v)}
          suffix=" px"
        />
      )}

      {showOpacity && (
        <Slider
          label="Opacity"
          min={1}
          max={100}
          value={Math.round(state.opacity * 100)}
          onChange={(v) => engine.setOpacity(v / 100)}
          suffix="%"
        />
      )}

      {state.tool === 'brush' && (
        <Slider
          label="Hardness"
          min={0}
          max={100}
          value={Math.round(state.hardness * 100)}
          onChange={(v) => engine.setHardness(v / 100)}
          suffix="%"
        />
      )}

      {showDynamics && (
        <div className="toggle-row">
          <Toggle
            label="Pressure"
            checked={state.pressureEnabled}
            onChange={(v) => engine.setPressureEnabled(v)}
          />
          <Toggle
            label="Smoothing"
            checked={state.smoothing}
            onChange={(v) => engine.setSmoothing(v)}
          />
        </div>
      )}

      {isShape && (
        <>
          <span className="field-label">Shape Style</span>
          <div className="segmented">
            {SHAPE_MODES.map((m) => (
              <button
                key={m.id}
                className={`segmented-btn ${state.shapeMode === m.id ? 'active' : ''}`}
                onClick={() => engine.setShapeMode(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}

      {isText && (
        <>
          <Slider
            label="Font Size"
            min={8}
            max={200}
            value={state.fontSize}
            onChange={(v) => engine.setFontSize(v)}
            suffix=" px"
          />
          <span className="field-label">Font</span>
          <select
            className="text-input"
            value={state.fontFamily}
            onChange={(e) => engine.setFontFamily(e.target.value)}
          >
            {FONT_FAMILIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <p className="hint-text">Click on the canvas to place text. Enter commits, Esc cancels.</p>
        </>
      )}

      <div className="divider" />

      <span className="field-label">Brush Presets</span>
      <div className="preset-list">
        {state.presets.map((p) => (
          <PresetButton key={p.id} preset={p} onApply={() => engine.applyPreset(p)} />
        ))}
      </div>

      <div className="divider" />

      <span className="field-label">Grid &amp; Snapping</span>
      <div className="toggle-row">
        <Toggle
          label="Show grid"
          checked={state.grid.show}
          onChange={(v) => engine.setGrid({ show: v })}
        />
        <Toggle
          label="Snap"
          checked={state.grid.snap}
          onChange={(v) => engine.setGrid({ snap: v })}
        />
      </div>
      {(state.grid.show || state.grid.snap) && (
        <Slider
          label="Grid size"
          min={8}
          max={128}
          step={4}
          value={state.grid.size}
          onChange={(v) => engine.setGrid({ size: v })}
          suffix=" px"
        />
      )}
    </div>
  );
}

function PresetButton({ preset, onApply }: { preset: BrushPreset; onApply: () => void }) {
  // Visual dot scales with the preset size for quick recognition.
  const dot = Math.min(22, 4 + preset.size * 0.5);
  return (
    <button className="preset-btn" onClick={onApply} title={preset.name}>
      <span className="preset-dot-wrap">
        <span
          className="preset-dot"
          style={{ width: dot, height: dot, opacity: preset.opacity }}
        />
      </span>
      <span className="preset-name">{preset.name}</span>
    </button>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track">
        <span className="toggle-thumb" />
      </span>
      <span className="toggle-label">{label}</span>
    </label>
  );
}
