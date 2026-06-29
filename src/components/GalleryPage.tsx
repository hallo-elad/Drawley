import { useEffect, useState } from 'react';
import { ArrowLeft, Download, Share2, Trash2, Brush } from 'lucide-react';
import { Logo } from './Logo';
import { useTheme } from '../hooks/useTheme';
import { Sun, Moon } from 'lucide-react';
import {
  buildShareLink,
  listGallery,
  removeFromGallery,
  type SharedArt,
} from '../lib/share';
import { downloadDataURL, toFilename } from '../lib/download';
import { useToast } from './ui/Toast';
import './GalleryPage.css';

/** Public gallery of shared artworks (stored locally, seeded with samples). */
export function GalleryPage() {
  const [items, setItems] = useState<SharedArt[]>([]);
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  useEffect(() => {
    setItems(listGallery());
  }, []);

  const remove = (id: string) => {
    removeFromGallery(id);
    setItems(listGallery());
    toast('Removed from gallery', 'info');
  };

  const share = async (art: SharedArt) => {
    const link = buildShareLink(art);
    try {
      await navigator.clipboard.writeText(link);
      toast('Share link copied', 'success');
    } catch {
      window.location.hash = `#/view?art=${link.split('art=')[1]}`;
    }
  };

  return (
    <div className="gallery-page">
      <header className="gallery-head">
        <a className="brand" href="#/">
          <Logo size={28} />
          <span className="brand-name">Drawley</span>
        </a>
        <div className="gallery-head-actions">
          <a className="btn primary" href="#/">
            <Brush size={16} /> Open Studio
          </a>
          <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>
      </header>

      <div className="gallery-hero">
        <a className="back-link" href="#/">
          <ArrowLeft size={16} /> Back to studio
        </a>
        <h1>Community Gallery</h1>
        <p>
          A showcase of artwork created with Drawley. Publish your own from the editor’s
          <strong> Share</strong> dialog.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="empty-note">The gallery is empty. Create and publish something beautiful!</p>
      ) : (
        <div className="gallery-grid">
          {items.map((art) => (
            <article key={art.id} className="gallery-card">
              <a
                className="gallery-thumb"
                href={`#/view?art=${buildShareLink(art).split('art=')[1]}`}
              >
                <img src={art.image} alt={art.title} loading="lazy" />
              </a>
              <div className="gallery-card-body">
                <h3>{art.title}</h3>
                {art.description && <p>{art.description}</p>}
                <div className="gallery-card-foot">
                  <span className="gallery-author">{art.author ?? 'Anonymous'}</span>
                  <div className="gallery-card-actions">
                    <button
                      className="icon-btn xs"
                      onClick={() => share(art)}
                      aria-label="Copy share link"
                    >
                      <Share2 size={15} />
                    </button>
                    <button
                      className="icon-btn xs"
                      onClick={() =>
                        downloadDataURL(art.image, toFilename(art.title, 'png'))
                      }
                      aria-label="Download"
                    >
                      <Download size={15} />
                    </button>
                    <button
                      className="icon-btn xs danger"
                      onClick={() => remove(art.id)}
                      aria-label="Remove"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
