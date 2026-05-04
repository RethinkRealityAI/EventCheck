import { useState, useLayoutEffect, useRef } from 'react';
import { FloatingToggleTabs } from '../ui/FloatingToggleTabs';
import { GlassCard } from '../ui/GlassCard';
import { OrganicAccordion, OrganicAccordionItem } from '../ui/OrganicAccordion';
import { REGISTRATION_PROCESS, IMPORTANT_NOTICE, GROUP_NOTE, INCLUDES, FAQS, SUPPORT_EMAIL } from './content';

type TabId = 'about' | 'includes' | 'faqs';

const STEP_GRADIENTS = [
  'bg-[linear-gradient(135deg,#ba0028_0%,#E0243C_100%)] bg-clip-text',     // 01 — pure red
  'bg-[linear-gradient(135deg,#8b2a5e_0%,#5a3575_100%)] bg-clip-text',      // 02 — pure purple/magenta
  'bg-[linear-gradient(135deg,#2260a1_0%,#1a4880_100%)] bg-clip-text',     // 03 — pure blue
];

export function InfoTabs() {
  const [tab, setTab] = useState<TabId>('about');
  const containerRef = useRef<HTMLDivElement>(null);
  const tabBarTopBeforeSwitch = useRef<number | null>(null);

  // Capture the tab bar's viewport-relative position BEFORE state change,
  // then after the new content renders, scroll so it's back at the same
  // viewport position. This anchors the tab bar regardless of whether
  // the new tab's content is taller or shorter than the previous tab's.
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
            {REGISTRATION_PROCESS.map((step, i) => (
              <GlassCard key={step.number}>
                <div className={`font-display text-7xl font-black text-transparent ${STEP_GRADIENTS[i]}`}>{step.number}</div>
                <h3 className="font-display text-2xl font-semibold mt-3">{step.title}</h3>
                <p className="font-body text-lg text-gansid-on-surface/80 mt-2">{step.body}</p>
              </GlassCard>
            ))}
          </div>
          <GlassCard tint="red">
            <h4 className="font-display text-xl font-semibold mb-2">⚠ Important Notice</h4>
            <p className="font-body text-lg text-gansid-on-surface/80">{IMPORTANT_NOTICE}</p>
          </GlassCard>
          <GlassCard tint="blue">
            <h4 className="font-display text-xl font-semibold mb-2">Group Registration</h4>
            <p className="font-body text-lg text-gansid-on-surface/80">{GROUP_NOTE}</p>
          </GlassCard>
        </div>
      )}

      {tab === 'includes' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 viscous-enter">
          <GlassCard tint="blue">
            <h3 className="font-display text-2xl md:text-3xl font-semibold mb-4">Registration Includes</h3>
            <ul className="space-y-3">
              {INCLUDES.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="text-gansid-secondary text-lg">✓</span>
                  <span className="font-body text-lg">{item}</span>
                </li>
              ))}
            </ul>
          </GlassCard>
          <GlassCard tint="red">
            <h3 className="font-display text-2xl md:text-3xl font-semibold mb-4">Not Included</h3>
            <div className="rounded-gansid-md bg-white/70 p-5 border border-gansid-primary-container/20">
              <p className="font-body text-lg text-gansid-on-surface font-semibold mb-1">Networking events</p>
              <p className="font-body text-base text-gansid-on-surface/70">
                Networking events can be purchased as an add-on in the registration form.
              </p>
            </div>
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
            <p className="font-body text-lg">
              Questions? Contact us at{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-gansid-secondary hover:underline">{SUPPORT_EMAIL}</a>
            </p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
