import { useMemo, useState } from 'react';
import { Download, Image as ImageIcon } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Slider } from '../ui/Slider';
import { useEngine, useEngineState } from '../../hooks/useEngine';
import { downloadDataURL, toFilename } from '../../lib/download';
import { useToast } from '../ui/Toast';
import './modals.css';

type Format = 'image/png' | 'image/jpeg';

export function ExportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine();
  const state = useEngineState();
  const { toast } = useToast();
  const [format, setFormat] = useState<Format>('image/png');
  const [scale, setScale] = useState(1);
  const [quality, setQuality] = useState(92);
  const [transparent, setTransparent] = useState(false);

  const outW = Math.round(state.canvasWidth * scale);
  const outH = Math.round(state.canvasHeight * scale);

  // Live preview (capped to keep it cheap).
  const preview = useMemo(() => {
    if (!open) return '';
    return engine.exportDataURL('image/png', 0.8, 360);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, format, transparent]);

  const doExport = () => {
    const png = format === 'image/png';
    const dataURL = engine
      .exportCanvas({ scale, background: png ? !transparent : true })
      .toDataURL(format, quality / 100);
    downloadDataURL(dataURL, toFilename(state.title, png ? 'png' : 'jpg'));
    toast('Artwork exported', 'success');
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Export Artwork"
      icon={<Download size={18} />}
      width={520}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={doExport}>
            <Download size={16} /> Download {format === 'image/png' ? 'PNG' : 'JPEG'}
          </button>
        </>
      }
    >
      <div className="export-grid">
        <div className="export-preview" style={{ background: transparent && format === 'image/png' ? 'var(--checker)' : undefined }}>
          {preview ? <img src={preview} alt="Export preview" /> : <ImageIcon size={32} />}
        </div>

        <div className="export-controls">
          <div className="form-row">
            <span className="field-label">Format</span>
            <div className="seg">
              <button
                className={`seg-btn ${format === 'image/png' ? 'active' : ''}`}
                onClick={() => setFormat('image/png')}
              >
                PNG
              </button>
              <button
                className={`seg-btn ${format === 'image/jpeg' ? 'active' : ''}`}
                onClick={() => setFormat('image/jpeg')}
              >
                JPEG
              </button>
            </div>
          </div>

          <div className="form-row">
            <span className="field-label">Resolution</span>
            <div className="seg">
              {[1, 2, 4].map((s) => (
                <button
                  key={s}
                  className={`seg-btn ${scale === s ? 'active' : ''}`}
                  onClick={() => setScale(s)}
                >
                  {s}×
                </button>
              ))}
            </div>
            <p className="export-dim">
              {outW} × {outH} px
            </p>
          </div>

          {format === 'image/png' ? (
            <label className="check-row">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              Transparent background
            </label>
          ) : (
            <div className="form-row">
              <Slider
                label="Quality"
                min={10}
                max={100}
                value={quality}
                onChange={setQuality}
                suffix="%"
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
