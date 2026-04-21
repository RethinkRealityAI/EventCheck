import React, { useEffect, useMemo, useState } from 'react';
import type { Form, AppSettings, FormField, FormStep } from '../../types';
import { getFormById } from '../../services/storageService';
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
  const [boothType, setBoothType] = useState<string | null>(null);
  const [hasAllDetails, setHasAllDetails] = useState(false);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [consents, setConsents] = useState({ terms: false, disclaimer: false, photo: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the companion staff form so StepStaffRoster's inline "Full Details"
  // accordion can render the per-staff dietary / emergency / consent fields.
  // The combined form itself has no such fields (it's component-driven).
  const [staffFormFields, setStaffFormFields] = useState<FormField[]>([]);
  useEffect(() => {
    const staffFormId = (form.settings as any)?.staffFormId;
    if (!staffFormId) return;
    let cancelled = false;
    getFormById(staffFormId).then(f => {
      if (!cancelled && f?.fields) setStaffFormFields(f.fields);
    }).catch(() => { /* non-fatal — falls back to name+email only */ });
    return () => { cancelled = true; };
  }, [form.settings]);

  // Build the list of step ids based on the user's current selections.
  // Every GANSID sponsor tier (Platinum/Gold/Silver/Bronze) and every booth type
  // includes staff registrations, so the Staff step is always shown.
  const stepIds = useMemo<StepId[]>(() => {
    const base: StepId[] = ['type', 'organization'];
    if (registrationType === 'sponsor') base.push('tier');
    if (registrationType === 'exhibitor') base.push('booth');
    base.push('staff', 'consents', 'review');
    return base;
  }, [registrationType]);

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

  // Keep step index in range if the stepIds list shrinks (e.g. switching tier to award
  // collapses the Staff step). Reset `step` on shrink so Previous/Next use the clamped
  // value rather than a stale one.
  const safeStep = Math.min(step, Math.max(0, stepperSteps.length - 1));
  useEffect(() => {
    if (step !== safeStep) setStep(safeStep);
  }, [safeStep, step]);
  const currentStepId = stepIds[safeStep];

  const buildPayload = (): SponsorExhibitorPayload => ({
    registrationType: registrationType!,
    org,
    sponsorTier: (sponsorTier as any) || undefined,
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
      const staffFormId = (form.settings as any)?.staffFormId || form.id;
      const { data, error: fnErr } = await supabase.functions.invoke('verify-payment', {
        body: {
          mode: 'paid',
          formId: form.id,
          sponsorExhibitorSubmission: true,
          staffFormId,
          ...payload,
        },
      });
      if (fnErr) throw new Error(fnErr.message);

      const staffIds = (data?.staffIds || []) as string[];
      const complete = (id: string) => `${window.location.origin}/#/?ref=${id}`;
      const signup = `${window.location.origin}/#/`;
      const eventName = (CURRENT_SITE as any).displayName || form.title;
      const categoryLabel = (c: string) =>
        c === 'hall_only' ? 'Hall-Only' : 'Full Congress';

      for (let i = 0; i < staff.length; i++) {
        const entry = staff[i];
        const id = staffIds[i];
        const isPlaceholder = !entry.name?.trim() && !entry.email?.trim();
        if (isPlaceholder || !id || !entry.email?.trim()) continue;

        // Inline-detail staff get the confirmation email (fully registered);
        // send-link staff get the invite to complete their own details.
        // Failures are swallowed per row so one SMTP hiccup doesn't block the success UI.
        try {
          if (hasAllDetails) {
            await supabase.functions.invoke('send-ticket-email', {
              body: {
                mode: 'staff-claim-completed',
                to: entry.email,
                name: entry.name,
                orgName: org.orgName,
                eventName,
                attachments: [],
              },
            });
          } else {
            await supabase.functions.invoke('send-ticket-email', {
              body: {
                mode: 'staff-invite',
                to: entry.email,
                name: entry.name,
                purchaser: org.contactName,
                orgName: org.orgName,
                category: categoryLabel(entry.category),
                completeUrl: complete(id),
                signupUrl: signup,
                eventName,
              },
            });
          }
        } catch (emailErr) {
          console.warn('Staff email failed for', entry.email, emailErr);
        }
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
        return <StepSponsorTier tier={sponsorTier} onTier={setSponsorTier} />;
      case 'booth':
        return <StepExhibitorBooth value={boothType} onChange={setBoothType} />;
      case 'staff':
        return (
          <StepStaffRoster
            staffFormFields={staffFormFields}
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
    <div
      className="portal-root min-h-screen flex flex-col lg:flex-row"
      style={{
        background:
          'radial-gradient(ellipse at 15% 10%, rgba(186, 0, 40, 0.08) 0%, transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(34, 96, 161, 0.08) 0%, transparent 55%), #fafafa',
      }}
    >
      <aside className="lg:w-72 lg:h-screen lg:sticky lg:top-0 lg:px-6 lg:py-8 px-4 py-4 border-b lg:border-b-0 lg:border-r border-gansid-on-surface/10 bg-white/40 backdrop-blur-viscous flex lg:flex-col">
        <StepperSidebar
          steps={stepperSteps}
          currentIndex={safeStep}
          completedSteps={completedSteps}
          onStepClick={(i) => setStep(i)}
        />
      </aside>
      <main className="flex-1 px-5 py-5 lg:px-10 lg:py-8 max-w-4xl mx-auto w-full">
        <header className="mb-5">
          <h1 className="font-display font-bold leading-[1.1] tracking-tight text-[clamp(1.75rem,3.6vw,2.75rem)] whitespace-nowrap overflow-hidden text-ellipsis bg-gansid-primary-gradient bg-clip-text text-transparent">
            {form.title}
          </h1>
          {form.description && (
            <p className="text-gansid-on-surface/70 mt-1.5 font-body text-sm lg:text-base leading-snug">
              {form.description}
            </p>
          )}
        </header>
        <GlassCard className="p-5 lg:p-7">
          {stepContent()}
          <div className="flex justify-between items-center mt-6 pt-5 border-t border-gansid-on-surface/10">
            <ViscousButton
              variant="secondary"
              onClick={() => setStep(Math.max(0, safeStep - 1))}
              disabled={safeStep === 0}
            >
              Previous
            </ViscousButton>
            <span className="text-xs font-body text-gansid-on-surface/50 hidden sm:block">
              Step {safeStep + 1} of {stepperSteps.length}
            </span>
            {safeStep < stepperSteps.length - 1 ? (
              <ViscousButton variant="primary" onClick={() => setStep(safeStep + 1)}>
                Next
              </ViscousButton>
            ) : (
              <ViscousButton variant="primary" onClick={onSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Registration'}
              </ViscousButton>
            )}
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
