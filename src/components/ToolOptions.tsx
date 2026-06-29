import { Slider } from './ui/Slider';
import { useEngine, useEngineState } from '../hooks/useEngine';
import type { BrushPreset } from '../types';
import './ToolOptions.css';

/** Contextual options for the active tool: size, opacity, presets, dynamics. */
export function ToolOptions() {
  const engine = useEngine();
  const state = useEngineState();

  const showOpacity = state.tool !== 'eraser' && state.tool !== 'pan' && state.tool !== 'eyedropper';
  const showDynamics = state.tool === 'brush' || state.tool === 'pencil';

  return (
    <div className="tool-options">
      <Slider
        label="Brush Size"
        min={1}
        max={200}
        value={state.brushSize}
        onChange={(v) => engine.setBrushSize(v)}
        suffix=" px"
      />

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
