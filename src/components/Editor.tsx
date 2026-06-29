import { useCallback, useEffect, useRef, useState } from 'react';
import { TopBar } from './TopBar';
import { Toolbar } from './Toolbar';
import { CanvasStage } from './CanvasStage';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';
import { ExportModal } from './modals/ExportModal';
import { ShareModal } from './modals/ShareModal';
import { ResizeModal } from './modals/ResizeModal';
import { NewDrawingModal } from './modals/NewDrawingModal';
import { OpenModal } from './modals/OpenModal';
import { ShortcutsModal } from './modals/ShortcutsModal';
import { useEngine } from '../hooks/useEngine';
import { useHotkeys } from '../hooks/useHotkeys';
import { useToast } from './ui/Toast';
import { saveDrawing, writeAutosave } from '../lib/storage';
import type { SavedDrawing } from '../types';
import './Editor.css';

type ModalId = 'export' | 'share' | 'resize' | 'new' | 'open' | 'shortcuts' | null;

/** The full drawing workspace. */
export function Editor() {
  const engine = useEngine();
  const { toast } = useToast();
  const [modal, setModal] = useState<ModalId>(null);
  const [saving, setSaving] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const close = useCallback(() => setModal(null), []);

  // --- Save -----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await saveDrawing(engine.serialize());
      toast('Drawing saved locally', 'success');
    } catch {
      toast('Could not save — storage may be full', 'error');
    } finally {
      setSaving(false);
    }
  }, [engine, toast]);

  // --- Export / Share / New shortcuts hooks ---------------------------------
  const handleNew = useCallback(() => setModal('new'), []);
  const handleExport = useCallback(() => setModal('export'), []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useHotkeys(engine, {
    onSave: handleSave,
    onExport: handleExport,
    onNew: handleNew,
    onToggleFullscreen: toggleFullscreen,
  });

  // --- Autosave (debounced, on idle) ----------------------------------------
  const autosaveTimer = useRef<number | null>(null);
  useEffect(() => {
    const unsub = engine.subscribe(() => {
      if (!engine.getState().dirty) return;
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = window.setTimeout(() => {
        writeAutosave(engine.serialize());
      }, 1500);
    });
    return () => {
      unsub();
      if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    };
  }, [engine]);

  const createNew = (w: number, h: number, background: string) => {
    engine.reset(w, h, background === 'transparent' ? 'rgba(0,0,0,0)' : background);
    close();
    toast('New canvas created', 'success');
  };

  const loadDrawing = async (drawing: SavedDrawing) => {
    await engine.load(drawing);
    close();
    toast(`Opened “${drawing.title}”`, 'success');
  };

  return (
    <div className="editor">
      <TopBar
        onNew={handleNew}
        onSave={handleSave}
        onOpen={() => setModal('open')}
        onExport={handleExport}
        onShare={() => setModal('share')}
        onResize={() => setModal('resize')}
        onShortcuts={() => setModal('shortcuts')}
        onToggleFullscreen={toggleFullscreen}
        isFullscreen={isFullscreen}
        saving={saving}
      />

      <div className="editor-body">
        <Toolbar />
        <CanvasStage />
        <RightPanel />
      </div>

      <StatusBar />

      <ExportModal open={modal === 'export'} onClose={close} />
      <ShareModal open={modal === 'share'} onClose={close} />
      <ResizeModal open={modal === 'resize'} onClose={close} />
      <NewDrawingModal open={modal === 'new'} onClose={close} onCreate={createNew} />
      <OpenModal open={modal === 'open'} onClose={close} onLoad={loadDrawing} />
      <ShortcutsModal open={modal === 'shortcuts'} onClose={close} />
    </div>
  );
}
