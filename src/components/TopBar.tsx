import {
  FilePlus2,
  Save,
  FolderOpen,
  Download,
  Share2,
  Images,
  Sun,
  Moon,
  Maximize2,
  Minimize2,
  Keyboard,
  Crop,
} from 'lucide-react';
import { useEngine, useEngineState } from '../hooks/useEngine';
import { useTheme } from '../hooks/useTheme';
import { Logo } from './Logo';
import './TopBar.css';

interface TopBarProps {
  onNew: () => void;
  onSave: () => void;
  onOpen: () => void;
  onExport: () => void;
  onShare: () => void;
  onResize: () => void;
  onShortcuts: () => void;
  onToggleFullscreen: () => void;
  isFullscreen: boolean;
  saving: boolean;
}

/** Application header: branding, document title and file actions. */
export function TopBar(props: TopBarProps) {
  const engine = useEngine();
  const state = useEngineState();
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="top-bar">
      <div className="top-left">
        <a className="brand" href="#/" aria-label="Drawley home">
          <Logo size={28} />
          <span className="brand-name">Drawley</span>
        </a>
        <div className="v-divider hide-sm" />
        <input
          className="title-input"
          value={state.title}
          onChange={(e) => engine.setTitle(e.target.value)}
          spellCheck={false}
          aria-label="Drawing title"
        />
        {state.dirty && <span className="dirty-dot" title="Unsaved changes" />}
      </div>

      <div className="top-actions">
        <button className="btn ghost hide-sm" onClick={props.onNew}>
          <FilePlus2 size={17} /> New
        </button>
        <button className="btn ghost hide-sm" onClick={props.onOpen}>
          <FolderOpen size={17} /> Open
        </button>
        <button className="btn ghost hide-md" onClick={props.onResize} data-tip="Resize canvas">
          <Crop size={17} /> Resize
        </button>

        <div className="v-divider hide-sm" />

        <button className="btn" onClick={props.onSave} disabled={props.saving}>
          <Save size={17} /> <span className="hide-sm">Save</span>
        </button>
        <button className="btn" onClick={props.onExport}>
          <Download size={17} /> <span className="hide-sm">Export</span>
        </button>
        <button className="btn primary" onClick={props.onShare}>
          <Share2 size={17} /> <span className="hide-sm">Share</span>
        </button>

        <div className="v-divider hide-sm" />

        <a className="icon-btn" href="#/gallery" data-tip="Gallery" aria-label="Open gallery">
          <Images size={19} />
        </a>
        <button
          className="icon-btn hide-sm"
          onClick={props.onShortcuts}
          data-tip="Shortcuts"
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={19} />
        </button>
        <button
          className="icon-btn"
          onClick={props.onToggleFullscreen}
          data-tip="Fullscreen · F"
          aria-label="Toggle fullscreen"
        >
          {props.isFullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
        </button>
        <button
          className="icon-btn"
          onClick={toggleTheme}
          data-tip="Toggle theme"
          aria-label="Toggle colour theme"
        >
          {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
        </button>
      </div>
    </header>
  );
}
