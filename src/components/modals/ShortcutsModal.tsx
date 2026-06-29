import { Keyboard } from 'lucide-react';
import { Modal } from '../ui/Modal';
import './modals.css';

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Tools',
    items: [
      ['Brush', 'B'],
      ['Pencil', 'P'],
      ['Eraser', 'E'],
      ['Line', 'L'],
      ['Rectangle', 'R'],
      ['Ellipse', 'O'],
      ['Fill bucket', 'G'],
      ['Text', 'T'],
      ['Select (marquee)', 'M'],
      ['Lasso', 'Q'],
      ['Move', 'V'],
      ['Eyedropper', 'I'],
      ['Quick colour pick', 'Alt + click'],
      ['Pan', 'H / Space'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['Undo', 'Ctrl + Z'],
      ['Redo', 'Ctrl + Y / Ctrl + Shift + Z'],
      ['Delete selection / layer', 'Delete'],
      ['Decrease size', '['],
      ['Increase size', ']'],
    ],
  },
  {
    title: 'Selection',
    items: [
      ['Select all', 'Ctrl + A'],
      ['Deselect', 'Ctrl + D / Esc'],
      ['Copy', 'Ctrl + C'],
      ['Cut', 'Ctrl + X'],
      ['Paste', 'Ctrl + V'],
      ['Duplicate', 'Ctrl + J'],
    ],
  },
  {
    title: 'File & View',
    items: [
      ['New', 'Ctrl + N'],
      ['Save', 'Ctrl + S'],
      ['Export', 'Ctrl + E'],
      ['Zoom in / out', 'Ctrl + +  /  Ctrl + −'],
      ['Fit to screen', 'Ctrl + 0'],
      ['Fullscreen', 'F'],
    ],
  },
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard Shortcuts"
      icon={<Keyboard size={18} />}
      width={560}
    >
      <div className="shortcut-groups">
        {GROUPS.map((g) => (
          <div key={g.title} className="shortcut-group">
            <span className="field-label">{g.title}</span>
            <ul>
              {g.items.map(([label, keys]) => (
                <li key={label}>
                  <span>{label}</span>
                  <kbd>{keys}</kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
