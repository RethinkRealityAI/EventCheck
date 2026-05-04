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

  // Per-step validation. Returns [] when the step can advance, or an array of
  // error messages to show inline. The user was able to skip steps before this.
  const [stepError, setStepError] = useState<string | null>(null);
  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
  const validateCurrentStep = (): string[] => {
    const errs: string[] = [];
    switch (currentStepId) {
      case 'type':
        if (!registrationType) errs.push('Please choose Sponsor or Exhibitor.');
        break;
      case 'organization':
        if (!org.orgName.trim()) errs.push('Organization Name is required.');
        if (!org.contactName.trim()) errs.push('Contact Name is required.');
        if (!org.email.trim()) errs.push('Contact Email is required.');
        else if (!isEmail(org.email)) errs.push('Contact Email is not a valid email address.');
        break;
      case 'tier':
        if (!sponsorTier) errs.push('Please select a sponsorship tier.');
        break;
      case 'booth':
        if (!boothType) errs.push('Please select a booth type.');
        break;
      case 'staff':
        if (staff.length === 0) {
          errs.push('Add at least one staff member, or go back and continue later from your portal.');
        }
        staff.forEach((s, i) => {
          const n = i + 1;
          const hasAny = s.name.trim() || s.email.trim();
          if (!hasAny) return; // empty placeholder is allowed (creates staff-pending slot)
          if (!s.name.trim()) errs.push(`Staff #${n}: name is required.`);
          if (!s.email.trim()) errs.push(`Staff #${n}: email is required.`);
          else if (!isEmail(s.email)) errs.push(`Staff #${n}: email is not a valid address.`);
          if (hasAllDetails && !hasAny) {
            errs.push(`Staff #${n}: fill in name + email when "details on hand" is checked.`);
          }
        });
        break;
      case 'consents':
        if (!consents.terms) errs.push('You must accept the Terms & Conditions.');
        if (!consents.disclaimer) errs.push('You must accept the Disclaimer & Liability Waiver.');
        if (!consents.photo) errs.push('You must acknowledge the photo/video consent.');
        break;
      default:
        break;
    }
    return errs;
  };
  const tryAdvance = () => {
    const errs = validateCurrentStep();
    if (errs.length) {
      setStepError(errs.join(' '));
      return;
    }
    setStepError(null);
    setStep(safeStep + 1);
  };
  // Clear the inline error whenever the user navigates away from the step.
  useEffect(() => { setStepError(null); }, [currentStepId]);

  const onSubmit = async () => {
    // Block submit if the Review step itself is reachable but an earlier step
    // has gaps (e.g. user clicked the stepper sidebar to jump here).
    const stepErrs = validateCurrentStep();
    if (stepErrs.length) {
      setStepError(stepErrs.join(' '));
      return;
    }
    const payload = buildPayload();
    const v = validateSubmission(payload);
    if (!v.ok) {
      setError(v.errors?.join('; ') || 'Validation failed');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // staffFormId must be a real, distinct registration form. Falling back to
      // `form.id` would point staff rows at the combined `sponsor_exhibitor` form
      // itself, which has no useful fields for staff to fill (the combined form
      // is component-driven), and the `?ref=` claim flow would render an empty
      // PublicRegistration. Hard-fail here with a user-facing error instead of
      // silently producing broken invitations.
      const staffFormId = (form.settings as any)?.staffFormId;
      if (!staffFormId) {
        setError('This form is misconfigured: no companion staff registration form is linked. Please contact the event organizers.');
        setSubmitting(false);
        return;
      }
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
      // Staff invite link MUST point at the public registration form
      // (`/#/form/<staffFormId>?ref=<staffId>`) so PublicRegistration's
      // pending-claim handler can pre-fill the staff member's name/email/category
      // and let them complete the remaining personal fields without being
      // forced through the portal landing/signup at `/`. The optional
      // `signupUrl` (still pointing at `/`) is offered as a separate "create
      // a portal account" link inside the email body.
      const complete = (id: string) => `${window.location.origin}/#/form/${staffFormId}?ref=${id}`;
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
      <aside className="lg:w-72 lg:h-screen lg:sticky lg:top-0 lg:px-6 lg:py-8 px-4 py-4 border-b lg:border-b-0 lg:border-r border-gansid-on-surface/10 bg-white/40 backdrop-blur-viscous flex lg:flex-col lg:items-stretch [&>nav]:lg:flex-1 [&>nav]:lg:min-h-0">
        <StepperSidebar
          steps={stepperSteps}
          currentIndex={safeStep}
          completedSteps={completedSteps}
          onStepClick={(i) => {
            // Allow going BACK freely. Forward jumps must validate the
            // current step first so the user can't skip required fields.
            if (i <= safeStep) {
              setStepError(null);
              setStep(i);
              return;
            }
            const errs = validateCurrentStep();
            if (errs.length) {
              setStepError(errs.join(' '));
              return;
            }
            setStepError(null);
            setStep(i);
          }}
        />
      </aside>
      <main className="flex-1 px-5 py-5 lg:px-10 lg:py-8 max-w-4xl mx-auto w-full">
        <header className="mb-5">
          <h1 className="font-display font-bold leading-[1.15] tracking-tight text-xl sm:text-2xl lg:text-[1.75rem] bg-gansid-primary-gradient bg-clip-text text-transparent">
            {form.title}
          </h1>
          {form.description && (
            <p className="text-gansid-on-surface/70 mt-2 font-body text-sm lg:text-base leading-snug">
              {form.description}
            </p>
          )}
        </header>
        <GlassCard className="p-5 lg:p-7">
          {stepContent()}
          {stepError && (
            <div className="mt-4 p-3 rounded bg-red-50 border border-red-200 text-sm text-red-900 font-body">
              {stepError}
            </div>
          )}
          <div className="flex justify-between items-center mt-6 pt-5 border-t border-gansid-on-surface/10">
            <ViscousButton
              variant="secondary"
              onClick={() => { setStepError(null); setStep(Math.max(0, safeStep - 1)); }}
              disabled={safeStep === 0}
            >
              Previous
            </ViscousButton>
            <span className="text-xs font-body text-gansid-on-surface/50 hidden sm:block">
              Step {safeStep + 1} of {stepperSteps.length}
            </span>
            {safeStep < stepperSteps.length - 1 ? (
              <ViscousButton variant="primary" onClick={tryAdvance}>
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
