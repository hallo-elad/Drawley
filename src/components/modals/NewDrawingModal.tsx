import { useState } from 'react';
import { FilePlus2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import './modals.css';

const PRESETS = [
  { name: 'Square', w: 1080, h: 1080 },
  { name: 'Landscape HD', w: 1920, h: 1080 },
  { name: 'Portrait', w: 1080, h: 1350 },
  { name: 'Wide', w: 2560, h: 1080 },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onCreate: (w: number, h: number, background: string) => void;
}

export function NewDrawingModal({ open, onClose, onCreate }: Props) {
  const [w, setW] = useState(1280);
  const [h, setH] = useState(800);
  const [bg, setBg] = useState('#ffffff');

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New Drawing"
      icon={<FilePlus2 size={18} />}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onCreate(w, h, bg)}>
            Create
          </button>
        </>
      }
    >
      <div className="form-row">
        <span className="field-label">Presets</span>
        <div className="preset-chips">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="chip"
              onClick={() => {
                setW(p.w);
                setH(p.h);
              }}
            >
              {p.name}
              <span>
                {p.w}×{p.h}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="form-row form-grid-2">
        <div>
          <span className="field-label">Width</span>
          <input
            type="number"
            className="text-input"
            value={w}
            onChange={(e) => setW(Number(e.target.value))}
          />
        </div>
        <div>
          <span className="field-label">Height</span>
          <input
            type="number"
            className="text-input"
            value={h}
            onChange={(e) => setH(Number(e.target.value))}
          />
        </div>
      </div>

      <div className="form-row">
        <span className="field-label">Background</span>
        <div className="bg-choices">
          {['#ffffff', '#0e0f17', '#f6f3ea', '#1d2b3a', 'transparent'].map((c) => (
            <button
              key={c}
              className={`bg-choice ${bg === c ? 'active' : ''} ${c === 'transparent' ? 'checker' : ''}`}
              style={{ background: c === 'transparent' ? undefined : c }}
              onClick={() => setBg(c)}
              aria-label={c}
            />
          ))}
          <label className="bg-choice custom">
            <input type="color" value={bg.startsWith('#') ? bg : '#ffffff'} onChange={(e) => setBg(e.target.value)} />
          </label>
        </div>
      </div>
    </Modal>
  );
}
