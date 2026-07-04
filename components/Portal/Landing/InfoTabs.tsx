import { useState, useLayoutEffect, useRef } from 'react';
import { FloatingToggleTabs } from '../ui/FloatingToggleTabs';
import { GlassCard } from '../ui/GlassCard';
import { OrganicAccordion, OrganicAccordionItem } from '../ui/OrganicAccordion';
import { useLandingContent } from '../content/ContentProvider';
import { sanitizeHtml } from '../../../utils/sanitizeHtml';

type TabId = 'about' | 'includes' | 'faqs';

const STEP_GRADIENTS = [
  'bg-[linear-gradient(135deg,#ba0028_0%,#E0243C_100%)] bg-clip-text',
  'bg-[linear-gradient(135deg,#8b2a5e_0%,#5a3575_100%)] bg-clip-text',
  'bg-[linear-gradient(135deg,#2260a1_0%,#1a4880_100%)] bg-clip-text',
];

const PERIOD_HEADER_COLORS = [
  'rounded-tl-xl bg-emerald-500/15 text-emerald-800',
  'bg-sky-500/15 text-sky-800',
  'rounded-tr-xl bg-amber-500/15 text-amber-800',
];

export function InfoTabs() {
  const {
    registrationProcess,
    importantNoticeHtml,
    groupNoteHtml,
    includes,
    notIncluded,
    faqs,
    supportEmail,
  } = useLandingContent();

  const [tab, setTab] = useState<TabId>('about');
  const containerRef = useRef<HTMLDivElement>(null);
  const tabBarTopBeforeSwitch = useRef<number | null>(null);

  const handleTabChange = (id: TabId) => {
    const container = containerRef.current;
    tabBarTopBeforeSwitch.current = container ? container.getBoundingClientRect().top : null;
    setTab(id);
  };

  useLayoutEffect(() => {
    if (tabBarTopBeforeSwitch.current === null) return;
    const container = containerRef.current;
    if (!container) { tabBarTopBeforeSwitch.current = null; return; }
    const newTop = container.getBoundingClientRect().top;
    const delta = newTop - tabBarTopBeforeSwitch.current;
    if (Math.abs(delta) > 0.5) {
      window.scrollBy({ top: delta, left: 0, behavior: 'instant' as ScrollBehavior });
    }
    tabBarTopBeforeSwitch.current = null;
  }, [tab]);

  return (
    <div ref={containerRef} className="space-y-8 scroll-mt-8">
      <div className="flex justify-center">
        <FloatingToggleTabs<TabId>
          tabs={[
            { id: 'about', label: 'About & Process' },
            { id: 'includes', label: "What's Included" },
            { id: 'faqs', label: 'FAQs' },
          ]}
          active={tab}
          onChange={handleTabChange}
        />
      </div>

      {tab === 'about' && (
        <div className="space-y-8 viscous-enter">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {registrationProcess.map((step, i) => (
              <GlassCard key={step.id}>
                <div className={`font-display text-7xl font-black text-transparent ${STEP_GRADIENTS[i % STEP_GRADIENTS.length]}`}>{step.number}</div>
                <h3 className="font-display text-2xl font-semibold mt-3">{step.title}</h3>
                <div
                  className="font-body text-lg text-gansid-on-surface/80 mt-2 [&_p]:mb-0"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(step.bodyHtml) }}
                />
              </GlassCard>
            ))}
          </div>
          <GlassCard tint="red">
            <h4 className="font-display text-xl font-semibold mb-2">⚠ Important Notice</h4>
            <div
              className="font-body text-lg text-gansid-on-surface/80 [&_p]:mb-0"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(importantNoticeHtml) }}
            />
          </GlassCard>
          <GlassCard tint="blue">
            <h4 className="font-display text-xl font-semibold mb-2">Group Registration</h4>
            <div
              className="font-body text-lg text-gansid-on-surface/80 [&_p]:mb-0"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(groupNoteHtml) }}
            />
          </GlassCard>
        </div>
      )}

      {tab === 'includes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 viscous-enter">
          <GlassCard tint="blue">
            <h3 className="font-display text-2xl md:text-3xl font-semibold mb-4">Registration Includes</h3>
            <ul className="space-y-3">
              {includes.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-secondary text-lg">✓</span>
                  <span className="font-body text-lg">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard tint="red">
            <h3 className="font-display text-2xl md:text-3xl font-semibold mb-4">Not Included</h3>
            <ul className="space-y-3">
              {notIncluded.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-primary text-lg">✗</span>
                  <span className="font-body text-lg">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>
      )}

      {tab === 'faqs' && (
        <div className="viscous-enter space-y-3">
          <OrganicAccordion>
            {faqs.map((faq) => (
              <OrganicAccordionItem key={faq.id} question={faq.question}>
                <div
                  className="mt-2 [&_p]:mb-0"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(faq.answerHtml) }}
                />
              </OrganicAccordionItem>
            ))}
          </OrganicAccordion>
          <GlassCard>
            <p className="font-body text-lg">
              Questions? Contact us at{' '}
              <a href={`mailto:${supportEmail}`} className="text-gansid-secondary hover:underline">{supportEmail}</a>
            </p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
