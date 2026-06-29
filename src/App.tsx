import { useEffect, useMemo, useState } from 'react';
import { DrawingEngine } from './engine/DrawingEngine';
import { EngineContext } from './hooks/useEngine';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './components/ui/Toast';
import { Editor } from './components/Editor';
import { GalleryPage } from './components/GalleryPage';
import { ShareViewPage } from './components/ShareViewPage';
import { readAutosave } from './lib/storage';

interface Route {
  name: 'editor' | 'gallery' | 'view';
  token?: string;
}

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  if (hash.startsWith('/gallery')) return { name: 'gallery' };
  if (hash.startsWith('/view')) {
    const q = hash.split('?')[1] ?? '';
    const params = new URLSearchParams(q);
    return { name: 'view', token: params.get('art') ?? '' };
  }
  return { name: 'editor' };
}

export default function App() {
  // The engine is a singleton for the app lifetime.
  const engine = useMemo(() => new DrawingEngine(1280, 800), []);
  const [route, setRoute] = useState<Route>(parseRoute);

  // Initialise history and restore the last autosave (if any).
  useEffect(() => {
    const auto = readAutosave();
    if (auto && parseRoute().name === 'editor') {
      engine.load(auto).catch(() => engine.seedHistory());
    } else {
      engine.seedHistory();
    }
    // Note: the engine is a page-lifetime singleton and intentionally not
    // disposed here — doing so would stop its render loop under React
    // StrictMode's mount/unmount/remount cycle.
  }, [engine]);

  // Hash-based routing.
  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute());
      // Scrolling resets when navigating between full pages.
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <EngineContext.Provider value={engine}>
      <ThemeProvider>
        <ToastProvider>
          {route.name === 'gallery' && <GalleryPage />}
          {route.name === 'view' && <ShareViewPage token={route.token ?? ''} />}
          {route.name === 'editor' && <Editor />}
        </ToastProvider>
      </ThemeProvider>
    </EngineContext.Provider>
  );
}
