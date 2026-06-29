import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import './ColorPanel.css';

/** Colour controls: active colour, hex input, recent colours, swatches, bg. */
export function ColorPanel() {
  const engine = useEngine();
  const state = useEngineState();
  const colorInput = useRef<HTMLInputElement>(null);
  const bgInput = useRef<HTMLInputElement>(null);

  const normalizeHex = (v: string) => {
    let h = v.trim();
    if (!h.startsWith('#')) h = '#' + h;
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(h)) return h;
    return null;
  };

  return (
    <div className="color-panel">
      <div className="color-main">
        <button
          className="color-swatch-lg"
          style={{ background: state.color }}
          onClick={() => colorInput.current?.click()}
          aria-label="Pick colour"
        >
          <input
            ref={colorInput}
            type="color"
            value={state.color.length === 7 ? state.color : '#000000'}
            onChange={(e) => engine.setColor(e.target.value)}
          />
        </button>
        <div className="color-meta">
          <input
            className="text-input hex-input"
            value={state.color}
            spellCheck={false}
            onChange={(e) => {
              const hex = normalizeHex(e.target.value);
              if (hex) engine.setColor(hex);
              else engine.setColor(e.target.value); // allow mid-typing
            }}
          />
          <div className="bg-control">
            <span className="field-label">Canvas</span>
            <button
              className="bg-swatch"
              style={{ background: state.background }}
              onClick={() => bgInput.current?.click()}
              aria-label="Canvas background colour"
            >
              <input
                ref={bgInput}
                type="color"
                value={state.background.length === 7 ? state.background : '#ffffff'}
                onChange={(e) => engine.setBackground(e.target.value)}
              />
            </button>
          </div>
        </div>
      </div>

      {state.recentColors.length > 0 && (
        <>
          <span className="field-label">Recent</span>
          <div className="swatch-grid">
            {state.recentColors.map((c) => (
              <button
                key={c}
                className="swatch"
                style={{ background: c }}
                onClick={() => engine.setColor(c)}
                aria-label={c}
              />
            ))}
          </div>
        </>
      )}

      <span className="field-label">Palette</span>
      <div className="swatch-grid">
        {state.swatches.map((c) => (
          <button
            key={c}
            className="swatch"
            style={{ background: c }}
            onClick={() => engine.setColor(c)}
            aria-label={c}
          />
        ))}
        <button
          className="swatch swatch-add"
          onClick={() => colorInput.current?.click()}
          aria-label="Add custom colour"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
