import React, { useMemo, useState } from 'react';
import type { Form, AppSettings, FormStep } from '../../types';
import { useAuth } from '../AuthContext';
import { StepperSidebar } from '../Portal/ui/StepperSidebar';
import { GlassCard } from '../Portal/ui/GlassCard';
import { ViscousButton } from '../Portal/ui/ViscousButton';
import StepRegistrationType from './steps/StepRegistrationType';
import StepOrgInfo from './steps/StepOrgInfo';
import StepSponsorTier from './steps/StepSponsorTier';
import StepExhibitorBooth from './steps/StepExhibitorBooth';
import StepStaffRoster from './steps/StepStaffRoster';
import StepConsents from './steps/StepConsents';
import StepReview from './steps/StepReview';
import { validateSubmission, type SponsorExhibitorPayload, type StaffEntry } from './validation';
import { supabase } from '../../services/supabaseClient';
import { CURRENT_SITE } from '../../config/sites';

interface Props { form: Form; settings: AppSettings; }

type StepId = 'type' | 'organization' | 'tier' | 'booth' | 'staff' | 'consents' | 'review';

export default function PublicSponsorExhibitorForm({ form, settings }: Props) {
  const { profile } = useAuth();
  const initialType =
    profile?.role === 'sponsor' ? 'sponsor' :
    profile?.role === 'exhibitor' ? 'exhibitor' :
    null;

  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] = useState<'sponsor' | 'exhibitor' | null>(initialType);
  const [org, setOrg] = useState({
    orgName: '', contactName: '', contactTitle: '', email: '',
    phone: '', address: '', website: '',
  });
  const [sponsorTier, setSponsorTier] = useState<string | null>(null);
  const [sponsorItems, setSponsorItems] = useState<Array<{ id: string; category: string; qty?: number }>>([]);
  const [sponsoredAwards, setSponsoredAwards] = useState<string[]>([]);
  const [boothType, setBoothType] = useState<string | null>(null);
  const [hasAllDetails, setHasAllDetails] = useState(false);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [consents, setConsents] = useState({ terms: false, disclaimer: false, photo: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build the list of step ids based on the user's current selections.
  const stepIds = useMemo<StepId[]>(() => {
    const base: StepId[] = ['type', 'organization'];
    if (registrationType === 'sponsor') base.push('tier');
    if (registrationType === 'exhibitor') base.push('booth');
    const isAwardOrScholarship = sponsorTier === 'award' || sponsorTier === 'scholarship';
    if (!isAwardOrScholarship) base.push('staff');
    base.push('consents', 'review');
    return base;
  }, [registrationType, sponsorTier]);

  const stepLabels: Record<StepId, string> = {
    type: 'Type',
    organization: 'Organization',
    tier: 'Tier',
    booth: 'Booth',
    staff: 'Staff',
    consents: 'Consents',
    review: 'Review',
  };

  const stepperSteps: FormStep[] = stepIds.map(id => ({ id, label: stepLabels[id] }));

  // Keep step index in range if the stepIds list shrinks (e.g. switching tier to award).
  const safeStep = Math.min(step, stepperSteps.length - 1);
  const currentStepId = stepIds[safeStep];

  const buildPayload = (): SponsorExhibitorPayload => ({
    registrationType: registrationType!,
    org,
    sponsorTier: (sponsorTier as any) || undefined,
    sponsorItems,
    sponsoredAwards,
    boothType: boothType || undefined,
    hasAllDetails,
    staff,
    consents,
  });

  const onSubmit = async () => {
    const payload = buildPayload();
    const v = validateSubmission(payload);
    if (!v.ok) {
      setError(v.errors?.join('; ') || 'Validation failed');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('verify-payment', {
        body: {
          mode: 'paid',
          formId: form.id,
          sponsorExhibitorSubmission: true,
          ...payload,
        },
      });
      if (fnErr) throw new Error(fnErr.message);

      const staffIds = (data?.staffIds || []) as string[];
      const complete = (id: string) => `${window.location.origin}/#/?ref=${id}`;
      const signup = `${window.location.origin}/#/`;
      const eventName = (CURRENT_SITE as any).eventName || form.title;

      for (let i = 0; i < staff.length; i++) {
        const entry = staff[i];
        const id = staffIds[i];
        const isPlaceholder = !entry.name?.trim() && !entry.email?.trim();
        // Inline-detail rows get a confirmation email path (not done here);
        // placeholders don't have a real recipient.
        if (hasAllDetails || isPlaceholder || !id) continue;
        if (!entry.email?.trim()) continue;

        // The runtime sendTicketEmail default signature doesn't expose the
        // multi-mode staff-invite shape, so call the edge function directly
        // with the typed shape from smtpService.ts.
        await supabase.functions.invoke('send-ticket-email', {
          body: {
            mode: 'staff-invite',
            to: entry.email,
            name: entry.name,
            purchaser: org.contactName,
            orgName: org.orgName,
            category:
              entry.category === 'hall_only' ? 'Hall-Only' :
              entry.category === 'full_access' ? 'Full-Access' :
              'Sponsor Seat',
            completeUrl: complete(id),
            signupUrl: signup,
            eventName,
          },
        });
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message || 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="portal-root min-h-screen flex items-center justify-center p-6">
        <GlassCard className="max-w-xl w-full p-8 text-center">
          <h1 className="text-2xl font-display mb-3">Registration complete</h1>
          <p className="font-body text-gansid-on-surface/80">
            {form.thankYouMessage || 'Thanks! Your staff will receive invitation emails shortly.'}
          </p>
        </GlassCard>
      </div>
    );
  }

  const stepContent = () => {
    switch (currentStepId) {
      case 'type':
        return <StepRegistrationType value={registrationType} onChange={setRegistrationType} />;
      case 'organization':
        return <StepOrgInfo value={org} onChange={setOrg} />;
      case 'tier':
        return (
          <StepSponsorTier
            form={form}
            tier={sponsorTier}
            onTier={setSponsorTier}
            items={sponsorItems}
            onItems={setSponsorItems}
            awards={sponsoredAwards}
            onAwards={setSponsoredAwards}
          />
        );
      case 'booth':
        return <StepExhibitorBooth value={boothType} onChange={setBoothType} />;
      case 'staff':
        return (
          <StepStaffRoster
            form={form}
            registrationType={registrationType!}
            sponsorTier={sponsorTier}
            boothType={boothType}
            hasAllDetails={hasAllDetails}
            onHasAllDetails={setHasAllDetails}
            staff={staff}
            onStaff={setStaff}
          />
        );
      case 'consents':
        return <StepConsents value={consents} onChange={setConsents} />;
      case 'review':
        return (
          <StepReview
            registrationType={registrationType!}
            org={org}
            sponsorTier={sponsorTier}
            boothType={boothType}
            staff={staff}
            hasAllDetails={hasAllDetails}
            onSubmit={onSubmit}
            submitting={submitting}
            error={error}
          />
        );
      default:
        return null;
    }
  };

  // Completed = strictly before current step. Keeps the stepper sidebar sane.
  const completedSteps = useMemo(() => {
    const s = new Set<number>();
    for (let i = 0; i < safeStep; i++) s.add(i);
    return s;
  }, [safeStep]);

  return (
    <div className="portal-root min-h-screen flex flex-col lg:flex-row bg-gansid-surface">
      <aside className="lg:w-64 lg:px-6 lg:py-8 px-4 py-4 border-b lg:border-b-0 lg:border-r border-gansid-on-surface/10">
        <StepperSidebar
          steps={stepperSteps}
          currentIndex={safeStep}
          completedSteps={completedSteps}
          onStepClick={(i) => setStep(i)}
        />
      </aside>
      <main className="flex-1 p-6 lg:p-8 max-w-3xl mx-auto w-full">
        <h1 className="text-3xl font-display mb-2 text-gansid-primary">{form.title}</h1>
        {form.description && (
          <p className="text-gansid-on-surface/70 mb-8 font-body">{form.description}</p>
        )}
        <GlassCard className="p-6 lg:p-8">
          {stepContent()}
          <div className="flex justify-between mt-8">
            <ViscousButton
              variant="secondary"
              onClick={() => setStep(Math.max(0, safeStep - 1))}
              disabled={safeStep === 0}
            >
              Previous
            </ViscousButton>
            {safeStep < stepperSteps.length - 1 && (
              <ViscousButton variant="primary" onClick={() => setStep(safeStep + 1)}>
                Next
              </ViscousButton>
            )}
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
