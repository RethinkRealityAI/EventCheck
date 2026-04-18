import { useState } from 'react';
import { FloatingToggleTabs } from '../ui/FloatingToggleTabs';
import { GlassCard } from '../ui/GlassCard';
import { OrganicAccordion, OrganicAccordionItem } from '../ui/OrganicAccordion';
import { REGISTRATION_PROCESS, IMPORTANT_NOTICE, GROUP_NOTE, INCLUDES, NOT_INCLUDED, FEES, FAQS, SUPPORT_EMAIL } from './content';

type TabId = 'about' | 'includes' | 'fees' | 'faqs';

export function InfoTabs() {
  const [tab, setTab] = useState<TabId>('about');
  const [feeTier, setFeeTier] = useState<'tier1' | 'tier2'>('tier1');
  const activeTier = FEES.tiers.find((t) => t.id === feeTier)!;

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <FloatingToggleTabs<TabId>
          tabs={[
            { id: 'about', label: 'About & Process' },
            { id: 'includes', label: "What's Included" },
            { id: 'fees', label: 'Conference Fees' },
            { id: 'faqs', label: 'FAQs' },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'about' && (
        <div className="space-y-8 viscous-enter">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {REGISTRATION_PROCESS.map((step) => (
              <GlassCard key={step.number}>
                <div className="font-display text-6xl font-black bg-gansid-gradient-reverse bg-clip-text text-transparent">{step.number}</div>
                <h3 className="font-display text-xl font-semibold mt-3">{step.title}</h3>
                <p className="font-body text-gansid-on-surface/80 mt-2">{step.body}</p>
              </GlassCard>
            ))}
          </div>
          <GlassCard tint="red">
            <h4 className="font-display font-semibold mb-2">⚠ Important Notice</h4>
            <p className="font-body text-gansid-on-surface/80">{IMPORTANT_NOTICE}</p>
          </GlassCard>
          <GlassCard tint="blue">
            <h4 className="font-display font-semibold mb-2">Group Registration</h4>
            <p className="font-body text-gansid-on-surface/80">{GROUP_NOTE}</p>
          </GlassCard>
        </div>
      )}

      {tab === 'includes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 viscous-enter">
          <GlassCard tint="blue">
            <h3 className="font-display text-2xl font-semibold mb-4">Registration Includes</h3>
            <ul className="space-y-2">
              {INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-secondary">✓</span>
                  <span className="font-body">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard tint="red">
            <h3 className="font-display text-2xl font-semibold mb-4">Not Included</h3>
            <ul className="space-y-2">
              {NOT_INCLUDED.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-primary-container">✕</span>
                  <span className="font-body">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      )}

      {tab === 'fees' && (
        <div className="viscous-enter space-y-6">
          <p className="text-center font-body text-gansid-on-surface/80">{FEES.note}</p>
          <div className="flex justify-center">
            <FloatingToggleTabs<'tier1' | 'tier2'>
              tabs={[
                { id: 'tier1', label: FEES.tiers[0].label },
                { id: 'tier2', label: FEES.tiers[1].label },
              ]}
              active={feeTier}
              onChange={setFeeTier}
            />
          </div>
          <p className="text-center font-body text-sm text-gansid-on-surface/60">{activeTier.subtitle}</p>
          <GlassCard className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="font-display">
                  <th className="text-left py-3">Category</th>
                  {FEES.periods.map((p) => (
                    <th key={p.id} className="text-right py-3">
                      <div>{p.label}</div>
                      <div className="text-xs text-gansid-on-surface/50 font-normal">{p.subtitle}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeTier.rows.map((row, i) => (
                  <tr key={row.category} className={i % 2 === 0 ? 'bg-gansid-secondary/5' : ''}>
                    <td className="py-3 font-body">{row.category}</td>
                    <td className="py-3 text-right font-display text-gansid-primary-container">${row.early}</td>
                    <td className="py-3 text-right font-display">${row.regular}</td>
                    <td className="py-3 text-right font-display">${row.onsite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </GlassCard>
        </div>
      )}

      {tab === 'faqs' && (
        <div className="viscous-enter space-y-3">
          <OrganicAccordion>
            {FAQS.map((faq) => (
              <OrganicAccordionItem key={faq.q} question={faq.q}>
                <p className="mt-2">{faq.a}</p>
              </OrganicAccordionItem>
            ))}
          </OrganicAccordion>
          <GlassCard>
            <p className="font-body">
              Questions? Contact us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gansid-secondary hover:underline">{SUPPORT_EMAIL}</a>
            </p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
