import { useEffect, useState } from 'react';
import { FolderOpen, Trash2, Clock } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { deleteDrawing, listDrawings } from '../../lib/storage';
import type { SavedDrawing } from '../../types';
import './modals.css';

interface Props {
  open: boolean;
  onClose: () => void;
  onLoad: (drawing: SavedDrawing) => void;
}

export function OpenModal({ open, onClose, onLoad }: Props) {
  const [items, setItems] = useState<SavedDrawing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listDrawings().then((d) => {
      setItems(d);
      setLoading(false);
    });
  }, [open]);

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteDrawing(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <Modal open={open} onClose={onClose} title="Open Drawing" icon={<FolderOpen size={18} />} width={620}>
      {loading ? (
        <p className="empty-note">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty-note">
          No saved drawings yet. Use <strong>Save</strong> (Ctrl+S) to store your work here.
        </p>
      ) : (
        <div className="open-grid">
          {items.map((d) => (
            <button key={d.id} className="open-card" onClick={() => onLoad(d)}>
              <div className="open-thumb">
                <img src={d.thumbnail} alt={d.title} loading="lazy" />
                <span
                  className="open-del"
                  onClick={(e) => remove(e, d.id)}
                  role="button"
                  aria-label="Delete"
                >
                  <Trash2 size={15} />
                </span>
              </div>
              <div className="open-meta">
                <strong>{d.title}</strong>
                <span className="open-sub">
                  <Clock size={12} /> {new Date(d.updatedAt).toLocaleDateString()} · {d.width}×{d.height}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
