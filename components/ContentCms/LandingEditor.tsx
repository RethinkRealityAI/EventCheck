import React from 'react';
import type { Faq, LandingContent, RegistrationStep } from '../../types';
import { LANDING_DEFAULTS } from '../Portal/content/landingDefaults';
import { PlainField } from './fields/PlainField';
import { RichField } from './fields/RichField';
import { StringListField } from './fields/StringListField';
import { RepeaterField } from './fields/RepeaterField';
import { ImageUploadField } from './fields/ImageUploadField';
import { SectionCard } from './cmsUi';

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
    <div className="space-y-4">
      <SectionCard
        title="Hero"
        description="Top banner — badge, dates, intro, and optional hero image"
        defaultOpen
        accent="red"
        onReset={() => onChange({ ...draft, hero: LANDING_DEFAULTS.hero })}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PlainField label="Badge" value={draft.hero.badge} onChange={(v) => patchHero({ badge: v })} placeholder="REGISTER ONE, GET ONE FREE!" />
          <PlainField label="Eyebrow" value={draft.hero.eyebrow} onChange={(v) => patchHero({ eyebrow: v })} placeholder="GANSID Congress 2026" />
          <PlainField label="Location" value={draft.hero.location} onChange={(v) => patchHero({ location: v })} />
          <PlainField label="Dates" value={draft.hero.dates} onChange={(v) => patchHero({ dates: v })} />
          <PlainField label="Venue" value={draft.hero.venue} onChange={(v) => patchHero({ venue: v })} />
          <PlainField label="CTA label" value={draft.hero.ctaLabel} onChange={(v) => patchHero({ ctaLabel: v })} placeholder="Register Now!" />
        </div>
        <RichField label="Intro paragraph" value={draft.hero.introHtml} onChange={(html) => patchHero({ introHtml: html })} />
        <ImageUploadField
          label="Hero image (optional)"
          hint="Wide banner shown below the intro. Leave empty for text-only hero."
          value={draft.hero.imageUrl}
          onChange={(imageUrl) => patchHero({ imageUrl })}
        />
      </SectionCard>

      <SectionCard
        title="Registration process"
        description="Three-step cards on the About tab"
        accent="blue"
        onReset={() => onChange({ ...draft, registrationProcess: LANDING_DEFAULTS.registrationProcess })}
      >
        <RepeaterField<RegistrationStep>
          label="Steps"
          items={draft.registrationProcess}
          onChange={(registrationProcess) => onChange({ ...draft, registrationProcess })}
          newItem={() => ({
            id: crypto.randomUUID(),
            number: String(draft.registrationProcess.length + 1).padStart(2, '0'),
            title: 'New step',
            bodyHtml: '<p></p>',
          })}
          renderItem={(step, patch) => (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <PlainField label="Number" value={step.number} onChange={(v) => patch({ number: v })} />
                <div className="col-span-2">
                  <PlainField label="Title" value={step.title} onChange={(v) => patch({ title: v })} />
                </div>
              </div>
              <RichField label="Body" value={step.bodyHtml} onChange={(html) => patch({ bodyHtml: html })} />
            </div>
          )}
        />
      </SectionCard>

      <SectionCard
        title="Important notice"
        onReset={() => onChange({ ...draft, importantNoticeHtml: LANDING_DEFAULTS.importantNoticeHtml })}
      >
        <RichField label="Notice" value={draft.importantNoticeHtml} onChange={(html) => onChange({ ...draft, importantNoticeHtml: html })} />
      </SectionCard>

      <SectionCard
        title="Group registration"
        onReset={() => onChange({ ...draft, groupNoteHtml: LANDING_DEFAULTS.groupNoteHtml })}
      >
        <RichField label="Group note" value={draft.groupNoteHtml} onChange={(html) => onChange({ ...draft, groupNoteHtml: html })} />
      </SectionCard>

      <SectionCard
        title="What's included / not included"
        onReset={() => onChange({
          ...draft,
          includes: LANDING_DEFAULTS.includes,
          notIncluded: LANDING_DEFAULTS.notIncluded,
        })}
      >
        <StringListField label="Included" items={draft.includes} onChange={(includes) => onChange({ ...draft, includes })} />
        <StringListField label="Not included" items={draft.notIncluded} onChange={(notIncluded) => onChange({ ...draft, notIncluded })} />
      </SectionCard>

      <SectionCard
        title="FAQs & support"
        onReset={() => onChange({ ...draft, faqs: LANDING_DEFAULTS.faqs, supportEmail: LANDING_DEFAULTS.supportEmail })}
      >
        <RepeaterField<Faq>
          label="Questions"
          items={draft.faqs}
          onChange={(faqs) => onChange({ ...draft, faqs })}
          newItem={() => ({ id: crypto.randomUUID(), question: 'New question', answerHtml: '<p></p>' })}
          renderItem={(faq, patch) => (
            <div className="space-y-3">
              <PlainField label="Question" value={faq.question} onChange={(v) => patch({ question: v })} />
              <RichField label="Answer" value={faq.answerHtml} onChange={(html) => patch({ answerHtml: html })} />
            </div>
          )}
        />
        <PlainField label="Support email" value={draft.supportEmail} onChange={(supportEmail) => onChange({ ...draft, supportEmail })} />
      </SectionCard>
    </div>
  );
}
