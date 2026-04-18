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
        'rounded-gansid-xl transition-all duration-400 ease-viscous overflow-hidden',
        open ? 'bg-gansid-surface-container-lowest/70 backdrop-blur-viscous shadow-invisible-lift' : 'bg-gansid-surface-container-low',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-6 py-4 flex items-center justify-between font-display text-left"
      >
        <span>{question}</span>
        <span className={`transition-transform duration-300 ${open ? 'rotate-45' : ''}`}>+</span>
      </button>
      {open && <div className="px-6 pb-6 text-gansid-on-surface/80 font-body viscous-enter">{children}</div>}
    </div>
  );
}

export function OrganicAccordion({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}
