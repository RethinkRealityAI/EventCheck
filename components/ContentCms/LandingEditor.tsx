import React from 'react';
import type { LandingContent } from '../../types';
import { PlainField } from './fields/PlainField';
import { RichField } from './fields/RichField';

export function LandingEditor({
  draft,
  onChange,
}: {
  draft: LandingContent;
  onChange: (d: LandingContent) => void;
}) {
  const patchHero = (p: Partial<LandingContent['hero']>) => {
    onChange({ ...draft, hero: { ...draft.hero, ...p } });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h3 className="text-lg font-bold text-slate-900">Hero</h3>
        <p className="text-sm text-slate-500">The top banner on the landing page.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <PlainField
          label="Badge"
          value={draft.hero.badge}
          onChange={(v) => patchHero({ badge: v })}
          placeholder="e.g. REGISTER ONE, GET ONE FREE!"
        />
        <PlainField
          label="Eyebrow"
          value={draft.hero.eyebrow}
          onChange={(v) => patchHero({ eyebrow: v })}
          placeholder="e.g. GANSID Congress 2026"
        />
        <PlainField
          label="Location"
          value={draft.hero.location}
          onChange={(v) => patchHero({ location: v })}
          placeholder="e.g. Hyderabad, India"
        />
        <PlainField
          label="Dates"
          value={draft.hero.dates}
          onChange={(v) => patchHero({ dates: v })}
          placeholder="e.g. October 23–25, 2026"
        />
        <PlainField
          label="Venue"
          value={draft.hero.venue}
          onChange={(v) => patchHero({ venue: v })}
          placeholder="e.g. HICC - Novotel"
        />
        <PlainField
          label="CTA Label"
          value={draft.hero.ctaLabel}
          onChange={(v) => patchHero({ ctaLabel: v })}
          placeholder="e.g. Register Now!"
        />
      </div>

      <RichField
        label="Intro"
        value={draft.hero.introHtml}
        onChange={(html) => patchHero({ introHtml: html })}
      />

      {/* TODO(next unit): registrationProcess, notice, group, includes/notIncluded, faqs, supportEmail */}
    </div>
  );
}
