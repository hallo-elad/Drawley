import { useEffect, useRef, useState } from 'react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import './CanvasStage.css';

/** An in-progress text placement: world position + current value. */
interface TextEdit {
  wx: number;
  wy: number;
  value: string;
}

/**
 * The interactive drawing surface. Owns the visible <canvas>, forwards pointer
 * input to the engine, and handles zoom / pan / pinch gestures. All heavy
 * lifting (rendering, pixel mutation) happens inside the engine.
 */
export function CanvasStage() {
  const engine = useEngine();
  const state = useEngineState();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Pointers currently down (for multi-touch gesture detection).
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const spaceHeld = useRef(false);
  const panning = useRef<{ x: number; y: number } | null>(null);
  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Commit any pending text, then clear the editor.
  const commitText = () => {
    if (textEdit) engine.commitText(textEdit.wx, textEdit.wy, textEdit.value);
    setTextEdit(null);
  };

  // Attach the canvas to the engine and keep the viewport in sync with size.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    engine.attachScreen(canvas);

    const ro = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      engine.setViewport(rect.width, rect.height, window.devicePixelRatio || 1);
    });
    ro.observe(wrap);

    // Initial sizing + centre the document.
    const rect = wrap.getBoundingClientRect();
    engine.setViewport(rect.width, rect.height, window.devicePixelRatio || 1);
    engine.fitToScreen();

    return () => {
      ro.disconnect();
      engine.detachScreen();
    };
  }, [engine]);

  // Track the spacebar for temporary pan mode.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        spaceHeld.current = true;
        if (wrapRef.current) wrapRef.current.style.cursor = 'grab';
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceHeld.current = false;
        if (wrapRef.current) wrapRef.current.style.cursor = '';
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // Focus the text editor as soon as it opens.
  useEffect(() => {
    if (textEdit) textRef.current?.focus();
  }, [textEdit !== null]);

  const localPoint = (e: PointerEvent | React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const isPanInput = (e: React.PointerEvent) =>
    state.tool === 'pan' || spaceHeld.current || e.button === 1;

  const isPaintTool = (t: string) =>
    t === 'brush' || t === 'pencil' || t === 'line' || t === 'rectangle' || t === 'ellipse';

  const onPointerDown = (e: React.PointerEvent) => {
    const p = localPoint(e);

    // Alt-click samples the colour under the cursor without switching tools.
    if (e.altKey && !isPanInput(e) && isPaintTool(state.tool)) {
      engine.sampleColorAt(p.x, p.y);
      return;
    }

    // Text tool: commit any open editor, then open a new one at the click.
    if (state.tool === 'text' && !isPanInput(e)) {
      if (textEdit) commitText();
      const w = engine.screenToWorld(p.x, p.y);
      setTextEdit({ wx: w.x, wy: w.y, value: '' });
      return;
    }

    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, p);

    // Two-finger touch → start pinch/pan gesture, cancelling any stroke.
    if (e.pointerType === 'touch' && pointers.current.size === 2) {
      engine.cancelStroke();
      const pts = [...pointers.current.values()];
      gesture.current = {
        dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        cx: (pts[0].x + pts[1].x) / 2,
        cy: (pts[0].y + pts[1].y) / 2,
      };
      return;
    }
    if (pointers.current.size > 1) return;

    if (isPanInput(e)) {
      panning.current = p;
      if (wrapRef.current) wrapRef.current.style.cursor = 'grabbing';
      return;
    }

    engine.pointerDown(p.x, p.y, readPressure(e), e.shiftKey);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = localPoint(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, p);

    // Pinch / two-finger pan.
    if (gesture.current && pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const cx = (pts[0].x + pts[1].x) / 2;
      const cy = (pts[0].y + pts[1].y) / 2;
      const g = gesture.current;
      engine.panBy(cx - g.cx, cy - g.cy);
      if (g.dist > 0) engine.zoomAt(cx, cy, dist / g.dist);
      gesture.current = { dist, cx, cy };
      return;
    }

    if (panning.current) {
      engine.panBy(p.x - panning.current.x, p.y - panning.current.y);
      panning.current = p;
      return;
    }

    const pressure = readPressure(e);
    // Coalesced events give smoother high-frequency strokes on supporting devices.
    const native = e.nativeEvent as PointerEvent;
    const events =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
    if (events.length > 1 && engineIsDrawing()) {
      for (const ce of events) {
        const cp = localPoint(ce);
        const cp2 = ce.pointerType === 'mouse' ? pressure : ce.pressure || pressure;
        engine.pointerMove(cp.x, cp.y, cp2, e.shiftKey);
      }
    } else {
      engine.pointerMove(p.x, p.y, pressure, e.shiftKey);
    }
  };

  const engineIsDrawing = () => engine.getState().tool !== 'pan';

  const endPointer = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (panning.current) {
      panning.current = null;
      if (wrapRef.current)
        wrapRef.current.style.cursor = spaceHeld.current ? 'grab' : '';
      return;
    }
    if (pointers.current.size === 0) engine.pointerUp();
  };

  const onPointerLeave = () => {
    engine.clearCursor();
  };

  // Non-passive wheel listener so we can preventDefault page zoom/scroll.
  useEffect(() => {
    const wrap = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (e.shiftKey) {
        // Horizontal pan with shift.
        engine.panBy(-e.deltaY, 0);
      } else if (e.ctrlKey || e.metaKey || !hasHorizontal(e)) {
        // Pinch-zoom (ctrl) or plain mouse wheel → zoom at the cursor.
        const factor = Math.exp(-e.deltaY * 0.0015);
        engine.zoomAt(x, y, factor);
      } else {
        // Trackpad two-finger scroll → pan.
        engine.panBy(-e.deltaX, -e.deltaY);
      }
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => wrap.removeEventListener('wheel', onWheel);
  }, [engine]);

  const cursorClass =
    state.tool === 'pan'
      ? 'cursor-pan'
      : state.tool === 'text'
        ? 'cursor-text'
        : state.tool === 'eyedropper' || state.tool === 'fill'
          ? 'cursor-pick'
          : 'cursor-cross';

  return (
    <div ref={wrapRef} className={`canvas-stage ${cursorClass}`}>
      <canvas
        ref={canvasRef}
        className="draw-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={onPointerLeave}
      />
      {textEdit && (
        <textarea
          ref={textRef}
          className="text-editor"
          value={textEdit.value}
          spellCheck={false}
          style={(() => {
            const s = engine.worldToScreen(textEdit.wx, textEdit.wy);
            return {
              left: s.x,
              top: s.y,
              color: state.color,
              font: `${state.fontSize * state.zoom}px ${state.fontFamily}`,
              lineHeight: 1.2,
            };
          })()}
          onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commitText();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setTextEdit(null);
            }
          }}
        />
      )}
    </div>
  );
}

function hasHorizontal(e: WheelEvent): boolean {
  return Math.abs(e.deltaX) > 0;
}

/**
 * Mouse devices report a constant 0.5 pressure while a button is held, which
 * would shrink pressure-sensitive brushes. Treat mouse as full pressure and use
 * the real value only for pen / touch.
 */
function readPressure(e: React.PointerEvent): number {
  if (e.pointerType === 'mouse') return 1;
  return e.pressure && e.pressure > 0 ? e.pressure : 1;
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}
