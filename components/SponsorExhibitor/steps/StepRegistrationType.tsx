import React from 'react';

interface Props {
  value: 'sponsor' | 'exhibitor' | null;
  onChange: (v: 'sponsor' | 'exhibitor') => void;
}

export default function StepRegistrationType({ value, onChange }: Props) {
  return (
    <section>
      <h2 className="text-xl font-display mb-4">How would you like to register?</h2>
      <p className="text-sm text-gansid-on-surface/70 mb-6 font-body">
        Choose one. You can change this later only by restarting the form.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(['sponsor', 'exhibitor'] as const).map(opt => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`p-6 rounded-gansid-lg border-2 text-left transition-all ${
              value === opt
                ? 'border-gansid-primary bg-gansid-primary/5 shadow-invisible-lift'
                : 'border-gansid-on-surface/10 hover:border-gansid-primary/50'
            }`}
          >
            <div className="font-display text-lg capitalize mb-1">{opt}</div>
            <div className="text-sm text-gansid-on-surface/70 font-body">
              {opt === 'sponsor'
                ? 'Register your organization as a sponsor — includes seats based on your tier.'
                : 'Register your organization as an exhibitor — includes staff seats based on your booth.'}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
