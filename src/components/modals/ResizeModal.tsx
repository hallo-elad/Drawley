import { useEffect, useState } from 'react';
import { Crop } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useEngine, useEngineState } from '../../hooks/useEngine';
import './modals.css';

const PRESETS = [
  { name: 'Square', w: 1080, h: 1080 },
  { name: 'HD', w: 1920, h: 1080 },
  { name: 'Portrait', w: 1080, h: 1350 },
  { name: 'A4', w: 2480, h: 3508 },
  { name: 'Banner', w: 1500, h: 500 },
  { name: 'Story', w: 1080, h: 1920 },
];

export function ResizeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine();
  const state = useEngineState();
  const [w, setW] = useState(state.canvasWidth);
  const [h, setH] = useState(state.canvasHeight);
  const [anchor, setAnchor] = useState<'topleft' | 'center'>('center');

  useEffect(() => {
    if (open) {
      setW(state.canvasWidth);
      setH(state.canvasHeight);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const apply = () => {
    engine.resizeDocument(w, h, anchor);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Resize Canvas"
      icon={<Crop size={18} />}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="form-row form-grid-2">
        <div>
          <span className="field-label">Width</span>
          <input
            type="number"
            className="text-input"
            value={w}
            min={16}
            max={8000}
            onChange={(e) => setW(Number(e.target.value))}
          />
        </div>
        <div>
          <span className="field-label">Height</span>
          <input
            type="number"
            className="text-input"
            value={h}
            min={16}
            max={8000}
            onChange={(e) => setH(Number(e.target.value))}
          />
        </div>
      </div>

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

      <div className="form-row">
        <span className="field-label">Anchor existing artwork</span>
        <div className="seg">
          <button
            className={`seg-btn ${anchor === 'topleft' ? 'active' : ''}`}
            onClick={() => setAnchor('topleft')}
          >
            Top-left
          </button>
          <button
            className={`seg-btn ${anchor === 'center' ? 'active' : ''}`}
            onClick={() => setAnchor('center')}
          >
            Center
          </button>
        </div>
      </div>
    </Modal>
  );
}
