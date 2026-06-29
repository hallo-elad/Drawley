import { ZoomIn, ZoomOut, Maximize, Expand } from 'lucide-react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import './StatusBar.css';

/** Bottom bar: document info and zoom controls. */
export function StatusBar() {
  const engine = useEngine();
  const state = useEngineState();

  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-chip">
          {state.canvasWidth} × {state.canvasHeight}
        </span>
        <span className="status-chip muted">{state.layers.length} layers</span>
        <span className="status-chip muted cap">{state.tool}</span>
      </div>

      <div className="status-zoom">
        <button
          className="icon-btn sm"
          onClick={() => engine.setZoom(state.zoom / 1.25)}
          aria-label="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <button
          className="zoom-label"
          onClick={() => engine.resetZoom()}
          title="Reset to 100%"
        >
          {Math.round(state.zoom * 100)}%
        </button>
        <button
          className="icon-btn sm"
          onClick={() => engine.setZoom(state.zoom * 1.25)}
          aria-label="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <div className="v-divider" />
        <button
          className="icon-btn sm"
          onClick={() => engine.fitToScreen()}
          data-tip="Fit to screen"
          aria-label="Fit to screen"
        >
          <Maximize size={16} />
        </button>
        <button
          className="icon-btn sm"
          onClick={() => engine.resetZoom()}
          data-tip="Actual size"
          aria-label="Actual size"
        >
          <Expand size={16} />
        </button>
      </div>
    </div>
  );
}
