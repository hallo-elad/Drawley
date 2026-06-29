import { useState } from 'react';
import {
  Plus,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Trash2,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { Slider } from './ui/Slider';
import { useEngine, useEngineState } from '../hooks/useEngine';
import './LayersPanel.css';

/** Photoshop-style layer stack with visibility, lock, opacity & reordering. */
export function LayersPanel() {
  const engine = useEngine();
  const state = useEngineState();
  const [editingId, setEditingId] = useState<string | null>(null);

  // Render front-to-back (top of the list = front-most layer).
  const ordered = [...state.layers].reverse();
  const active = state.layers.find((l) => l.id === state.activeLayerId);

  return (
    <div className="layers-panel">
      <div className="layers-head">
        <span className="field-label">Layers</span>
        <button className="icon-btn sm" onClick={() => engine.addLayer()} data-tip="Add layer">
          <Plus size={16} />
        </button>
      </div>

      {active && (
        <Slider
          label="Layer opacity"
          min={0}
          max={100}
          value={Math.round(active.opacity * 100)}
          onChange={(v) => engine.updateLayer(active.id, { opacity: v / 100 })}
          suffix="%"
        />
      )}

      <div className="layer-list">
        {ordered.map((layer) => {
          const isActive = layer.id === state.activeLayerId;
          return (
            <div
              key={layer.id}
              className={`layer-row ${isActive ? 'active' : ''}`}
              onClick={() => engine.setActiveLayer(layer.id)}
            >
              <button
                className="layer-vis"
                onClick={(e) => {
                  e.stopPropagation();
                  engine.updateLayer(layer.id, { visible: !layer.visible });
                }}
                aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
              >
                {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>

              {editingId === layer.id ? (
                <input
                  className="layer-name-input"
                  autoFocus
                  defaultValue={layer.name}
                  onBlur={(e) => {
                    engine.updateLayer(layer.id, { name: e.target.value || layer.name });
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="layer-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingId(layer.id);
                  }}
                >
                  {layer.name}
                </span>
              )}

              <div className="layer-actions">
                <button
                  className="icon-btn xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    engine.moveLayer(layer.id, 1);
                  }}
                  aria-label="Move up"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  className="icon-btn xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    engine.moveLayer(layer.id, -1);
                  }}
                  aria-label="Move down"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  className="icon-btn xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    engine.updateLayer(layer.id, { locked: !layer.locked });
                  }}
                  aria-label={layer.locked ? 'Unlock' : 'Lock'}
                >
                  {layer.locked ? <Lock size={14} /> : <Unlock size={14} />}
                </button>
                <button
                  className="icon-btn xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    engine.duplicateLayer(layer.id);
                  }}
                  aria-label="Duplicate"
                >
                  <Copy size={14} />
                </button>
                <button
                  className="icon-btn xs danger"
                  disabled={state.layers.length <= 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    engine.removeLayer(layer.id);
                  }}
                  aria-label="Delete layer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
