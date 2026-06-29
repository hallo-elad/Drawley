import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Copy, Check, Images, Pencil } from 'lucide-react';
import { Logo } from './Logo';
import { useEngine } from '../hooks/useEngine';
import { useToast } from './ui/Toast';
import { addToGallery, decodeShare, type SharedArt } from '../lib/share';
import { downloadDataURL, toFilename } from '../lib/download';
import { uid } from '../engine/DrawingEngine';
import './ShareViewPage.css';

/** Standalone viewer for an artwork opened via a share link. */
export function ShareViewPage({ token }: { token: string }) {
  const engine = useEngine();
  const { toast } = useToast();
  const [art, setArt] = useState<SharedArt | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setArt(decodeShare(token));
  }, [token]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      toast('Link copied', 'success');
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast('Copy failed', 'error');
    }
  };

  const editCopy = async () => {
    if (!art) return;
    // Load the shared image into the editor as a single editable layer.
    await engine.load({
      id: uid('art-'),
      title: `${art.title} (copy)`,
      description: art.description,
      width: art.width,
      height: art.height,
      background: '#ffffff',
      thumbnail: art.image,
      layers: [
        {
          id: uid('layer-'),
          name: 'Artwork',
          visible: true,
          opacity: 1,
          locked: false,
          data: art.image,
        },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    window.location.hash = '#/';
    toast('Opened a copy in the studio', 'success');
  };

  if (art === undefined) {
    return <div className="share-view loading">Loading artwork…</div>;
  }

  if (art === null) {
    return (
      <div className="share-view">
        <ShareHeader />
        <div className="share-empty">
          <h1>This link looks broken</h1>
          <p>The artwork data could not be read. The link may be incomplete.</p>
          <a className="btn primary" href="#/">
            Go to Studio
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="share-view">
      <ShareHeader />
      <main className="share-main">
        <a className="back-link" href="#/gallery">
          <ArrowLeft size={16} /> Gallery
        </a>
        <div className="share-stage">
          <img src={art.image} alt={art.title} />
        </div>
        <div className="share-info">
          <h1>{art.title}</h1>
          {art.description && <p className="share-desc">{art.description}</p>}
          <p className="share-byline">
            by {art.author ?? 'Anonymous'} · {art.width} × {art.height}
          </p>
          <div className="share-actions">
            <button className="btn primary" onClick={editCopy}>
              <Pencil size={16} /> Edit a copy
            </button>
            <button
              className="btn"
              onClick={() => downloadDataURL(art.image, toFilename(art.title, 'png'))}
            >
              <Download size={16} /> Download
            </button>
            <button className="btn" onClick={copyLink}>
              {copied ? <Check size={16} /> : <Copy size={16} />} Copy link
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                addToGallery(art);
                toast('Saved to your gallery', 'success');
              }}
            >
              <Images size={16} /> Save to gallery
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

function ShareHeader() {
  return (
    <header className="share-head">
      <a className="brand" href="#/">
        <Logo size={28} />
        <span className="brand-name">Drawley</span>
      </a>
      <a className="btn" href="#/gallery">
        <Images size={16} /> Gallery
      </a>
    </header>
  );
}
