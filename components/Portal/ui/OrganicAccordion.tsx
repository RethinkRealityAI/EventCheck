import { useState, type ReactNode } from 'react';

interface AccordionItemProps {
  question: string;
  children: ReactNode;
}

export function OrganicAccordionItem({ question, children }: AccordionItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={[
        'rounded-gansid-lg transition-all duration-400 overflow-hidden border',
        open
          ? 'bg-white border-gansid-secondary/30 shadow-lg'
          : 'bg-gansid-surface-container-low/60 border-gansid-outline-variant/20 hover:border-gansid-secondary/20',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between font-display text-left font-semibold"
      >
        <span>{question}</span>
        <span className={`text-gansid-secondary text-2xl transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && <div className="px-6 pb-6 text-gansid-on-surface/80 font-body viscous-enter">{children}</div>}
    </div>
  );
}

export function OrganicAccordion({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
