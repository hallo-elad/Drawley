import { useEffect } from 'react';
import type { DrawingEngine } from '../engine/DrawingEngine';
import type { ToolId } from '../types';

interface HotkeyHandlers {
  onSave: () => void;
  onExport: () => void;
  onNew: () => void;
  onToggleFullscreen: () => void;
}

const TOOL_KEYS: Record<string, ToolId> = {
  b: 'brush',
  p: 'pencil',
  e: 'eraser',
  l: 'line',
  r: 'rectangle',
  o: 'ellipse',
  g: 'fill',
  t: 'text',
  m: 'select',
  q: 'lasso',
  v: 'move',
  h: 'pan',
  i: 'eyedropper',
};

/**
 * Global keyboard shortcuts. Ignored while typing into inputs so text fields
 * (title, description, dimensions) behave normally.
 */
export function useHotkeys(engine: DrawingEngine, handlers: HotkeyHandlers): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;

      if (mod) {
        switch (e.key.toLowerCase()) {
          case 'z':
            e.preventDefault();
            if (e.shiftKey) engine.redo();
            else engine.undo();
            return;
          case 'y':
            e.preventDefault();
            engine.redo();
            return;
          case 's':
            e.preventDefault();
            handlers.onSave();
            return;
          case 'n':
            e.preventDefault();
            handlers.onNew();
            return;
          case 'e':
            e.preventDefault();
            handlers.onExport();
            return;
          case 'a':
            e.preventDefault();
            engine.selectAll();
            return;
          case 'c':
            e.preventDefault();
            engine.copySelection();
            return;
          case 'x':
            e.preventDefault();
            engine.cutSelection();
            return;
          case 'v':
            e.preventDefault();
            engine.paste();
            return;
          case 'j':
            e.preventDefault();
            engine.duplicateSelection();
            return;
          case 'd':
            e.preventDefault();
            engine.deselect();
            return;
          case '=':
          case '+':
            e.preventDefault();
            engine.setZoom(engine.getState().zoom * 1.2);
            return;
          case '-':
            e.preventDefault();
            engine.setZoom(engine.getState().zoom / 1.2);
            return;
          case '0':
            e.preventDefault();
            engine.fitToScreen();
            return;
        }
        return;
      }

      // Single-key shortcuts.
      const k = e.key.toLowerCase();
      if (TOOL_KEYS[k]) {
        engine.setTool(TOOL_KEYS[k]);
        return;
      }
      switch (e.key) {
        case '[':
          engine.setBrushSize(engine.getState().brushSize - 2);
          break;
        case ']':
          engine.setBrushSize(engine.getState().brushSize + 2);
          break;
        case 'f':
        case 'F':
          handlers.onToggleFullscreen();
          break;
        case 'Delete':
        case 'Backspace':
          engine.deleteSelection();
          break;
        case 'Escape':
          engine.deselect();
          break;
        case ',':
          engine.prevFrame();
          break;
        case '.':
          engine.nextFrame();
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [engine, handlers]);
}
