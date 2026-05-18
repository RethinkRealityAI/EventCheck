import React, { useEffect, useMemo, useState } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
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
import StepExtras from './steps/StepExtras';
import StepConsents from './steps/StepConsents';
import StepReview from './steps/StepReview';
import {
  validateSubmission,
  EXTRA_STAFF_UNIT_PRICE_USD,
  EXTRA_STAFF_MAX_PER_ORDER,
  type SponsorExhibitorPayload,
  type StaffEntry,
  type ExtraStaffEntry,
} from './validation';
import { supabase } from '../../services/supabaseClient';
import { CURRENT_SITE } from '../../config/sites';

interface Props {
  form: Form;
  settings: AppSettings;
  /**
   * True when the form is rendered inside the portal RegisterModal (constrained
   * card with overflow-hidden). In that case we drop `min-h-screen` and rely on
   * the modal's height + inner column scroll instead, which fixes content
   * getting clipped past the bottom of the modal with no scroll affordance.
   */
  isEmbedded?: boolean;
}

type StepId = 'type' | 'organization' | 'tier' | 'booth' | 'staff' | 'extras' | 'consents' | 'review';

export default function PublicSponsorExhibitorForm({ form, settings, isEmbedded }: Props) {
  const { profile, user } = useAuth();
  // The auth profile resolves asynchronously — on first paint it's null even
  // for users who came in via the dedicated sponsor/exhibitor page. We
  // initialise from whatever's already loaded and then reactively sync once
  // the profile arrives. Without the effect below, role-locked users would
  // briefly see the 'type' step and then end up on 'organization' with
  // registrationType still null, which would silently fail validation at
  // submit time.
  const profileRole: 'sponsor' | 'exhibitor' | null =
    profile?.role === 'sponsor' ? 'sponsor' :
    profile?.role === 'exhibitor' ? 'exhibitor' :
    null;

  const [step, setStep] = useState(0);
  const [registrationType, setRegistrationType] = useState<'sponsor' | 'exhibitor' | null>(profileRole);

  // Reactive sync: when the auth profile resolves and carries a sponsor/
  // exhibitor role, adopt it as the registration type (only if the user
  // hasn't already picked something else manually — direct-link visitors
  // who already chose 'sponsor' on the type step shouldn't get clobbered
  // if their session later flips to 'exhibitor', though that combination
  // is unusual).
  useEffect(() => {
    if (!profileRole) return;
    setRegistrationType((curr) => curr ?? profileRole);
  }, [profileRole]);
  // Pre-fill org info from the signed-in user's account metadata so the user
  // doesn't have to re-type their name / email / company they already gave
  // during signup. The sponsor/exhibitor signup writes `full_name` and
  // `organization` into auth user_metadata; both end up on the profiles row
  // via the handle_new_user trigger. We read from both — whichever resolves
  // first wins, with reactive sync below when profile loads.
  const initialMetaName = (user?.user_metadata?.full_name as string | undefined)?.trim() ?? '';
  const initialMetaOrg = (user?.user_metadata?.organization as string | undefined)?.trim() ?? '';
  const initialMetaEmail = user?.email ?? '';

  const [org, setOrg] = useState({
    orgName: profile?.organization ?? initialMetaOrg ?? '',
    contactName: profile?.fullName ?? initialMetaName ?? '',
    contactTitle: '',
    email: profile?.email ?? initialMetaEmail ?? '',
    phone: profile?.phone ?? '',
    address: '',
    website: '',
  });

  // Reactive sync: when profile/user resolves after first paint, fill any
  // org fields that are still empty. We never overwrite values the user has
  // already typed — pre-fill is a convenience, not a constraint.
  useEffect(() => {
    setOrg((curr) => ({
      ...curr,
      orgName: curr.orgName || profile?.organization || (user?.user_metadata?.organization as string | undefined) || '',
      contactName: curr.contactName || profile?.fullName || (user?.user_metadata?.full_name as string | undefined) || '',
      email: curr.email || profile?.email || user?.email || '',
      phone: curr.phone || profile?.phone || '',
    }));
  }, [profile, user]);
  const [sponsorTier, setSponsorTier] = useState<string | null>(null);
  const [boothType, setBoothType] = useState<string | null>(null);
  const [hasAllDetails, setHasAllDetails] = useState(false);
  const [staff, setStaff] = useState<StaffEntry[]>([]);
  const [extras, setExtras] = useState<ExtraStaffEntry[]>([]);
  const [consents, setConsents] = useState({ terms: false, disclaimer: false, photo: false });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Role is locked from session when the user arrived from the sponsor/
  // exhibitor registration page and signed in there — `profile.role` is set
  // to either 'sponsor' or 'exhibitor'. In that case we skip the explicit
  // "type" step entirely. Direct-link visitors with no role see the type
  // step as before.
  const roleLockedFromSession = profileRole !== null;

  // PayPal client ID — same fallback chain as PublicSponsorForm. Used only
  // when extras.length > 0 to render the PayPal button on the review step.
  const getEnvVar = (name: string): string => {
    try { return (import.meta as any).env[name] || ''; } catch { return ''; }
  };
  const paypalEnv = (getEnvVar('VITE_PAYPAL_ENV') || 'live').toLowerCase();
  const paypalClientId =
    (paypalEnv === 'sandbox'
      ? getEnvVar('VITE_PAYPAL_SANDBOX_CLIENT_ID') || getEnvVar('VITE_PAYPAL_CLIENT_ID')
      : getEnvVar('VITE_PAYPAL_CLIENT_ID')) ||
    settings?.paypalClientId ||
    '';

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
  //
  // When the role is locked from session metadata, the 'type' step is skipped
  // — the user already declared sponsor/exhibitor at signup on the dedicated
  // registration page.
  const stepIds = useMemo<StepId[]>(() => {
    const base: StepId[] = [];
    if (!roleLockedFromSession) base.push('type');
    base.push('organization');
    if (registrationType === 'sponsor') base.push('tier');
    if (registrationType === 'exhibitor') base.push('booth');
    base.push('staff', 'extras', 'consents', 'review');
    return base;
  }, [registrationType, roleLockedFromSession]);

  const stepLabels: Record<StepId, string> = {
    type: 'Type',
    organization: 'Organization',
    tier: 'Tier',
    booth: 'Booth',
    staff: 'Staff',
    extras: 'Extras',
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
    extras,
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
      case 'extras':
        if (extras.length > EXTRA_STAFF_MAX_PER_ORDER) {
          errs.push(`You can add at most ${EXTRA_STAFF_MAX_PER_ORDER} additional staff per registration.`);
        }
        extras.forEach((e, i) => {
          const n = i + 1;
          if (!e.name.trim()) errs.push(`Additional staff #${n}: name is required.`);
          if (!e.email.trim()) errs.push(`Additional staff #${n}: email is required.`);
          else if (!isEmail(e.email)) errs.push(`Additional staff #${n}: email is not a valid address.`);
          if (e.category !== 'hall_only' && e.category !== 'full_access') {
            errs.push(`Additional staff #${n}: pick an access type.`);
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

  const onSubmit = async (paypalOrderId?: string) => {
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
    // Paid-extras require a PayPal capture before we even call verify-payment.
    // When this function is invoked from the PayPal `onApprove` callback the
    // capture has already happened and `paypalOrderId` is set. Otherwise we
    // bail and let the PayPal button drive the flow.
    if (payload.extras.length > 0 && !paypalOrderId) {
      setError('Please complete payment via the PayPal button below before submitting.');
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
          paypalOrderId,
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
                // Let the edge function stamp `last_ticket_email_at` so
                // the dashboard reflects that we sent this staff member
                // their confirmation.
                attendeeId: id,
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
        return <StepOrgInfo value={org} onChange={setOrg} prefilledFromAccount={prefilledFromAccount} />;
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
      case 'extras':
        return <StepExtras extras={extras} onExtras={setExtras} />;
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
            extras={extras}
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

  // We treat the org info as pre-filled when (a) the user arrived from the
  // sponsor/exhibitor signup (role locked from session) AND (b) we actually
  // resolved their organization name from session metadata. Direct-link
  // visitors without an account see the regular blank-input layout.
  const prefilledFromAccount = roleLockedFromSession && !!org.orgName && !!org.contactName;

  // Layout: full-screen (min-h-screen) when the form is mounted as a top-level
  // route at /#/form/<id>, vs. constrained-height (h-full + inner scroll) when
  // mounted inside the portal RegisterModal. Without the embed-aware swap,
  // the modal's overflow-hidden + our min-h-screen produced content clipped
  // past the modal's bottom with no scroll affordance.
  const containerClass = isEmbedded
    ? 'portal-root h-full min-h-0 flex flex-col lg:flex-row overflow-hidden'
    : 'portal-root min-h-screen flex flex-col lg:flex-row';
  const asideClass = isEmbedded
    ? 'lg:w-72 lg:h-full lg:overflow-y-auto lg:px-6 lg:py-8 px-4 py-4 border-b lg:border-b-0 lg:border-r border-gansid-on-surface/10 bg-white/40 backdrop-blur-viscous flex lg:flex-col lg:items-stretch [&>nav]:lg:flex-1 [&>nav]:lg:min-h-0'
    : 'lg:w-72 lg:h-screen lg:sticky lg:top-0 lg:px-6 lg:py-8 px-4 py-4 border-b lg:border-b-0 lg:border-r border-gansid-on-surface/10 bg-white/40 backdrop-blur-viscous flex lg:flex-col lg:items-stretch [&>nav]:lg:flex-1 [&>nav]:lg:min-h-0';
  const mainClass = isEmbedded
    ? 'flex-1 lg:h-full lg:overflow-y-auto px-5 py-5 lg:px-10 lg:py-8 max-w-4xl mx-auto w-full'
    : 'flex-1 px-5 py-5 lg:px-10 lg:py-8 max-w-4xl mx-auto w-full';

  return (
    <div
      className={containerClass}
      style={{
        background:
          'radial-gradient(ellipse at 15% 10%, rgba(186, 0, 40, 0.08) 0%, transparent 55%), radial-gradient(ellipse at 85% 90%, rgba(34, 96, 161, 0.08) 0%, transparent 55%), #fafafa',
      }}
    >
      <aside className={asideClass}>
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
      <main className={mainClass}>
        {/*
         * When embedded in RegisterModal, reserve space at the top-right of
         * the header for the modal's absolute close-X (~56px wide) so the
         * title isn't clipped. Skip the right-padding in full-page mode
         * where there's no overlay to avoid.
         */}
        <header className={`mb-5 ${isEmbedded ? 'pr-14 lg:pr-16' : ''}`}>
          <h1 className="font-display font-bold leading-[1.15] tracking-tight text-xl sm:text-2xl lg:text-[1.75rem] bg-gansid-primary-gradient bg-clip-text text-transparent">
            Thank you for partnering with us
          </h1>
          <p className="text-gansid-on-surface/70 mt-2 font-body text-sm lg:text-base leading-snug">
            Your support is making the inaugural GANSID Congress possible. Please confirm a few details and
            register your booth staff below. Need more seats? You can purchase additional booth staff beyond
            your package allotment at the Extras step.
          </p>
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
            ) : extras.length === 0 ? (
              <ViscousButton variant="primary" onClick={() => onSubmit()} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Registration'}
              </ViscousButton>
            ) : (
              // Paid extras path: render the PayPal button. The button itself
              // is the submit affordance — pressing the regular submit before
              // PayPal capture is rejected by onSubmit. We pass the captured
              // PayPal order id straight into onSubmit on approve.
              <div className="flex flex-col items-end gap-2 min-w-[260px]">
                <span className="text-xs font-body text-gansid-on-surface/70">
                  ${extras.length * EXTRA_STAFF_UNIT_PRICE_USD} USD · pay below to finalize
                </span>
                {paypalClientId ? (
                  <div className="w-full" key={`${paypalClientId}-${extras.length}`}>
                    <PayPalScriptProvider
                      options={{ clientId: paypalClientId, currency: 'USD', components: 'buttons' }}
                    >
                      <PayPalButtons
                        style={{ layout: 'horizontal', shape: 'rect', tagline: false, height: 40 }}
                        disabled={submitting}
                        createOrder={(_data, actions) =>
                          actions.order.create({
                            intent: 'CAPTURE',
                            purchase_units: [{
                              amount: {
                                currency_code: 'USD',
                                value: (extras.length * EXTRA_STAFF_UNIT_PRICE_USD).toFixed(2),
                              },
                              description: `GANSID Congress — ${extras.length} additional booth staff`,
                            }],
                            application_context: { shipping_preference: 'NO_SHIPPING' },
                          })
                        }
                        onApprove={async (data) => { await onSubmit(data.orderID); }}
                        onCancel={() => setError('Payment was cancelled. You can try again when ready.')}
                        onError={(err) => {
                          console.error('PayPal error', err);
                          setError('Something went wrong with PayPal. Please try again or contact the event organizers.');
                        }}
                      />
                    </PayPalScriptProvider>
                  </div>
                ) : (
                  <div className="px-3 py-2 bg-amber-50 text-amber-700 rounded-lg text-xs font-body">
                    PayPal isn't configured for this site. Please contact the event organizers to complete your additional staff purchase.
                  </div>
                )}
              </div>
            )}
          </div>
        </GlassCard>
      </main>
    </div>
  );
}
