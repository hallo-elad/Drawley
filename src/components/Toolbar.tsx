import {
  Brush,
  Pencil,
  Eraser,
  Minus,
  Square,
  Circle,
  PaintBucket,
  Type,
  Hand,
  Pipette,
  Undo2,
  Redo2,
  Trash2,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import type { ToolId } from '../types';
import './Toolbar.css';

interface ToolDef {
  id: ToolId;
  icon: ReactNode;
  label: string;
  shortcut: string;
}

const TOOLS: ToolDef[] = [
  { id: 'brush', icon: <Brush size={20} />, label: 'Brush', shortcut: 'B' },
  { id: 'pencil', icon: <Pencil size={20} />, label: 'Pencil', shortcut: 'P' },
  { id: 'eraser', icon: <Eraser size={20} />, label: 'Eraser', shortcut: 'E' },
  { id: 'line', icon: <Minus size={20} />, label: 'Line', shortcut: 'L' },
  { id: 'rectangle', icon: <Square size={20} />, label: 'Rectangle', shortcut: 'R' },
  { id: 'ellipse', icon: <Circle size={20} />, label: 'Ellipse', shortcut: 'O' },
  { id: 'fill', icon: <PaintBucket size={20} />, label: 'Fill', shortcut: 'G' },
  { id: 'text', icon: <Type size={20} />, label: 'Text', shortcut: 'T' },
  { id: 'eyedropper', icon: <Pipette size={20} />, label: 'Eyedropper', shortcut: 'I' },
  { id: 'pan', icon: <Hand size={20} />, label: 'Pan', shortcut: 'H' },
];

/** Vertical tool rail with the primary tools and undo/redo/clear. */
export function Toolbar() {
  const engine = useEngine();
  const state = useEngineState();

  return (
    <div className="toolbar">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`tool-btn ${state.tool === t.id ? 'active' : ''}`}
          onClick={() => engine.setTool(t.id)}
          data-tip={`${t.label} · ${t.shortcut}`}
          aria-label={t.label}
          aria-pressed={state.tool === t.id}
        >
          {t.icon}
        </button>
      ))}

      <div className="toolbar-spacer" />

      <button
        className="tool-btn"
        disabled={!state.canUndo}
        onClick={() => engine.undo()}
        data-tip="Undo · Ctrl+Z"
        aria-label="Undo"
      >
        <Undo2 size={20} />
      </button>
      <button
        className="tool-btn"
        disabled={!state.canRedo}
        onClick={() => engine.redo()}
        data-tip="Redo · Ctrl+Y"
        aria-label="Redo"
      >
        <Redo2 size={20} />
      </button>
      <button
        className="tool-btn danger"
        onClick={() => engine.clearCanvas()}
        data-tip="Clear canvas"
        aria-label="Clear canvas"
      >
        <Trash2 size={20} />
      </button>
    </div>
  );
}
