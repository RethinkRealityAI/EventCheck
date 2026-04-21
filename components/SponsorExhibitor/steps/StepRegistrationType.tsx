import React from 'react';
import { Building2, HandHeart } from 'lucide-react';

interface Props {
  value: 'sponsor' | 'exhibitor' | null;
  onChange: (v: 'sponsor' | 'exhibitor') => void;
}

type OptionKey = 'sponsor' | 'exhibitor';

const OPTIONS: Array<{
  key: OptionKey;
  title: string;
  blurb: string;
  Icon: typeof HandHeart;
  selectedClass: string;
  idleClass: string;
  accentClass: string;
}> = [
  {
    key: 'sponsor',
    title: 'Sponsor',
    blurb: 'Commit to a tier (Signature, Gold, Silver, Award or Scholarship) and receive included congress registrations.',
    Icon: HandHeart,
    selectedClass:
      'border-gansid-primary bg-gradient-to-br from-gansid-primary/10 via-gansid-primary/5 to-transparent shadow-invisible-lift text-gansid-on-surface',
    idleClass:
      'border-gansid-primary/20 bg-white/70 text-gansid-on-surface/80 hover:border-gansid-primary/60 hover:bg-gansid-primary/5',
    accentClass:
      'bg-gansid-primary-gradient text-white',
  },
  {
    key: 'exhibitor',
    title: 'Exhibitor',
    blurb: 'Pick a booth type (9 m² or 18 m², corner or in-line) and register the staff included with your booth.',
    Icon: Building2,
    selectedClass:
      'border-gansid-secondary bg-gradient-to-br from-gansid-secondary/15 via-gansid-secondary/5 to-transparent shadow-invisible-lift text-gansid-on-surface',
    idleClass:
      'border-gansid-secondary/20 bg-white/70 text-gansid-on-surface/80 hover:border-gansid-secondary/60 hover:bg-gansid-secondary/5',
    accentClass:
      'bg-gradient-to-br from-gansid-secondary to-[#0f3d6a] text-white',
  },
];

export default function StepRegistrationType({ value, onChange }: Props) {
  return (
    <section>
      <h2 className="text-lg font-display mb-1">How would you like to register?</h2>
      <p className="text-sm text-gansid-on-surface/70 mb-4 font-body">
        Pick one — you'll confirm the details on the next step.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {OPTIONS.map(({ key, title, blurb, Icon, selectedClass, idleClass, accentClass }) => {
          const selected = value === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              aria-pressed={selected}
              className={`relative p-5 rounded-gansid-lg border-2 text-left transition-all duration-200 ease-viscous flex items-start gap-4 ${
                selected ? selectedClass : idleClass
              }`}
            >
              <span
                className={`shrink-0 h-11 w-11 rounded-full flex items-center justify-center shadow-md ${accentClass}`}
                aria-hidden
              >
                <Icon className="w-5 h-5" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-display font-semibold text-base mb-1">{title}</span>
                <span className="block text-sm font-body leading-snug">{blurb}</span>
              </span>
              {selected && (
                <span
                  className="absolute top-3 right-3 h-5 w-5 rounded-full bg-gansid-primary-gradient text-white flex items-center justify-center text-[11px] font-bold"
                  aria-hidden
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
