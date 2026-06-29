import { useEffect, useState } from 'react';
import { Share2, Copy, Check, Images, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useEngine, useEngineState } from '../../hooks/useEngine';
import { addToGallery, buildShareLink, type SharedArt } from '../../lib/share';
import { uid } from '../../engine/DrawingEngine';
import { useToast } from '../ui/Toast';
import './modals.css';

export function ShareModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine();
  const state = useEngineState();
  const { toast } = useToast();
  const [link, setLink] = useState('');
  const [art, setArt] = useState<SharedArt | null>(null);
  const [copied, setCopied] = useState(false);
  const [inGallery, setInGallery] = useState(false);

  // Build the shareable artwork + link whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const image = engine.exportDataURL('image/jpeg', 0.82, 1400);
    const shared: SharedArt = {
      id: uid('art-'),
      title: state.title || 'Untitled Drawing',
      description: state.description,
      width: state.canvasWidth,
      height: state.canvasHeight,
      image,
      author: 'You',
      createdAt: Date.now(),
    };
    setArt(shared);
    setLink(buildShareLink(shared));
    setInGallery(false);
    setCopied(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Fallback for non-secure contexts.
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    toast('Share link copied', 'success');
    setTimeout(() => setCopied(false), 1800);
  };

  const publish = () => {
    if (!art) return;
    addToGallery(art);
    setInGallery(true);
    toast('Published to the gallery', 'success');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Share Artwork"
      icon={<Share2 size={18} />}
      width={520}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Done
          </button>
          <button className="btn" onClick={publish} disabled={inGallery}>
            {inGallery ? <Check size={16} /> : <Images size={16} />}
            {inGallery ? 'In Gallery' : 'Add to Gallery'}
          </button>
          <a className="btn primary" href={link} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Open Link
          </a>
        </>
      }
    >
      <div className="form-row">
        <span className="field-label">Title</span>
        <input
          className="text-input"
          value={state.title}
          onChange={(e) => engine.setTitle(e.target.value)}
        />
      </div>
      <div className="form-row">
        <span className="field-label">Description</span>
        <textarea
          className="text-input"
          rows={2}
          placeholder="Say something about your artwork…"
          value={state.description}
          onChange={(e) => engine.setDescription(e.target.value)}
        />
      </div>

      {art && (
        <div className="share-preview">
          <img src={art.image} alt="Share preview" />
        </div>
      )}

      <div className="form-row" style={{ marginTop: 14 }}>
        <span className="field-label">Shareable link</span>
        <div className="copy-field">
          <input className="text-input" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button className="btn primary copy-btn" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="hint">
          The link contains your artwork itself — it works on any device, no account needed.
        </p>
      </div>
    </Modal>
  );
}
