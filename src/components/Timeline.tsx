import {
  Plus,
  Copy,
  Trash2,
  Play,
  Pause,
  Layers as LayersIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import './Timeline.css';

/** Bottom animation timeline: frame strip, onion skin and playback controls. */
export function Timeline() {
  const engine = useEngine();
  const state = useEngineState();

  const activeIdx = state.frames.findIndex((f) => f.id === state.activeFrameId);

  return (
    <div className="timeline">
      <div className="timeline-controls">
        <button
          className="icon-btn sm"
          onClick={() => engine.togglePlay()}
          disabled={state.frames.length < 2}
          data-tip={state.playing ? 'Pause' : 'Play'}
          aria-label={state.playing ? 'Pause' : 'Play'}
        >
          {state.playing ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <div className="fps-control" title="Frames per second">
          <input
            type="number"
            min={1}
            max={30}
            value={state.fps}
            onChange={(e) => engine.setFps(Number(e.target.value))}
          />
          <span>fps</span>
        </div>

        <button
          className={`icon-btn sm ${state.onionSkin ? 'active' : ''}`}
          onClick={() => engine.toggleOnionSkin()}
          data-tip="Onion skin"
          aria-label="Toggle onion skin"
        >
          <LayersIcon size={16} />
        </button>

        <div className="v-divider" />

        <button
          className="icon-btn sm"
          onClick={() => engine.addFrame(false)}
          data-tip="Add blank frame"
          aria-label="Add blank frame"
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-btn sm"
          onClick={() => engine.duplicateFrame()}
          data-tip="Duplicate frame"
          aria-label="Duplicate frame"
        >
          <Copy size={16} />
        </button>
      </div>

      <div className="frame-strip">
        {state.frames.map((f, i) => {
          const isActive = f.id === state.activeFrameId;
          return (
            <div
              key={f.id}
              className={`frame-cell ${isActive ? 'active' : ''}`}
              onClick={() => engine.setFrame(f.id)}
            >
              <span className="frame-num">{i + 1}</span>
              <div className="frame-thumb">
                {/* The active frame is shown live on the canvas, so its cached
                    thumbnail can be stale; show it anyway as a hint. */}
                {f.thumb ? <img src={f.thumb} alt={`Frame ${i + 1}`} /> : <div className="frame-blank" />}
              </div>
              {isActive && (
                <div className="frame-actions">
                  <button
                    className="icon-btn xs"
                    disabled={i === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.moveFrame(f.id, -1);
                    }}
                    aria-label="Move frame left"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  <button
                    className="icon-btn xs danger"
                    disabled={state.frames.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.deleteFrame(f.id);
                    }}
                    aria-label="Delete frame"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    className="icon-btn xs"
                    disabled={i === state.frames.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      engine.moveFrame(f.id, 1);
                    }}
                    aria-label="Move frame right"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="timeline-meta">
        Frame {activeIdx + 1} / {state.frames.length}
      </div>
    </div>
  );
}
