import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { ColorPanel } from './ColorPanel';
import { ToolOptions } from './ToolOptions';
import { LayersPanel } from './LayersPanel';
import './RightPanel.css';

/** Collapsible inspector section. */
function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`panel-section ${open ? 'open' : ''}`}>
      <button className="panel-section-head" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <ChevronDown size={16} className="chevron" />
      </button>
      {open && <div className="panel-section-body">{children}</div>}
    </section>
  );
}

/** Right-hand inspector with colour, tool options and layers. */
export function RightPanel() {
  return (
    <aside className="right-panel">
      <Section title="Color">
        <ColorPanel />
      </Section>
      <Section title="Tool">
        <ToolOptions />
      </Section>
      <Section title="Layers">
        <LayersPanel />
      </Section>
    </aside>
  );
}
