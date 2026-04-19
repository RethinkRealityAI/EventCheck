import React, { useState, useEffect, useRef } from 'react';
import { getFormById, getSettings, saveAttendee, getAttendee, getGuestsByPrimaryId, mapAttendeeToDb } from '../services/storageService';
import { FormField, AppSettings, Attendee, Form, DynamicPricingSelection } from '../types';
import type { PricingTemplate } from '../types';
import { resolveBracket, resolveTier, computeTotal, formatPrice } from '../utils/pricing';
import { computeGroupTotal, type GroupMemberPricingInput } from '../utils/groupPricing';
import { clearAllProgress } from '../utils/registrationProgress';
import CountryField from './FormBuilder/fields/CountryField';
import { getCountryName } from '../utils/countries';
import GroupPersonRow from './Group/GroupPersonRow';
import GroupShortcutsToggle from './Group/GroupShortcutsToggle';
import { supabase } from '../services/supabaseClient';
import { Loader2, Check, AlertCircle, Download, Calendar, Tag, CreditCard, ArrowRight, X, Eye, MapPin, UserPlus, Info, Copy } from 'lucide-react';
import { useNotifications } from './NotificationSystem';
import { useParams, useLocation } from 'react-router-dom';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { sendTicketEmail, arrayBufferToBase64 } from '../services/smtpService';
import QRCode from 'react-qr-code';
import PublicSponsorForm from './Sponsors/PublicSponsorForm';
import PublicExhibitorForm from './Exhibitor/PublicExhibitorForm';
import ConsentCheckbox from './Consent/ConsentCheckbox';
import { validateRequired, validateRms, validateGroupMembers } from './SteppedRegistration/steppedValidation';
import PricingBracketBanner from './Pricing/PricingBracketBanner';
import LivePriceCategory from './Pricing/LivePriceCategory';
import AddonsList from './Pricing/AddonsList';
import RunningTotal from './Pricing/RunningTotal';
import { SingleFormShell } from './SteppedRegistration/SingleFormShell';
import { SteppedFormShell } from './SteppedRegistration/SteppedFormShell';
import { useAuth } from './AuthContext';

interface PublicRegistrationProps {
  /** Override the formId that would otherwise come from route params (used when embedded in a modal). */
  formId?: string;
  /** If provided, a "Return to Portal" button appears on the success screen and invokes this. */
  onComplete?: () => void;
  /** If provided, a "Save & Close" button appears in the stepper footer and invokes this.
   *  Progress is already in localStorage (auto-saved); this exists purely so users are
   *  confident their work is preserved without having to hit X. */
  onSaveAndClose?: () => void;
}

const PublicRegistration = ({ formId: propFormId, onComplete, onSaveAndClose }: PublicRegistrationProps = {}) => {
  // Embedded = rendered inside the portal RegisterModal (which sets onComplete).
  // Non-embedded = standalone public URL (`/#/form/<id>`) — gets full-page card styling.
  const isEmbedded = !!onComplete;
  const params = useParams<{ formId: string }>();
  const formId = propFormId ?? params.formId;
  const { user, profile } = useAuth();
  const [form, setForm] = useState<Form | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  // Prevents the "Form not found" flash during the initial fetch. Only flips true
  // AFTER the first fetch effect has finished — at that point, form being null
  // genuinely means the record doesn't exist.
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedTicket, setGeneratedTicket] = useState<Attendee | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [guestTicketsData, setGuestTicketsData] = useState<Array<{ name: string, attendee: Attendee, registrationUrl?: string }>>([]);
  const { showNotification } = useNotifications();

  // Ticket / Payment State
  // Map itemId -> quantity
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string, value: number, type: 'percent' | 'fixed' } | null>(null);

  const [paymentTotal, setPaymentTotal] = useState(0);

  // Donation State (seat-based — donating extra tickets for others)
  const [donateOption, setDonateOption] = useState<'no' | 'table' | 'seats'>('no');
  const [donatedSeats, setDonatedSeats] = useState(0);
  const [donatedTables, setDonatedTables] = useState(0);

  // Guest State
  const [guests, setGuests] = useState<Array<{ name: string, email: string, dietary: string, guestType: 'adult' | 'child' }>>([]);
  const [skipGuestDetails, setSkipGuestDetails] = useState(false);
  const [isFirstGuestPurchaser, setIsFirstGuestPurchaser] = useState(true);

  // Claim-time portal signup (offered to pending-claim guests when they complete their details)
  const [claimSignupOptIn, setClaimSignupOptIn] = useState(true);
  const [claimSignupPassword, setClaimSignupPassword] = useState('');

  // Guest Mode State (when registering from a link)
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const guestRef = searchParams.get('ref');
  const [mode, setMode] = useState<'purchaser' | 'guest'>((guestRef ? 'guest' : 'purchaser') as 'purchaser' | 'guest');
  const [fetchedPrimaryAttendee, setFetchedPrimaryAttendee] = useState<Attendee | null>(null);
  const [remainingSeats, setRemainingSeats] = useState<number>(0);
  const [isTableFull, setIsTableFull] = useState(false);
  // Pending-claim: the specific guest record referenced by the ?ref link
  const [loadedRefAttendee, setLoadedRefAttendee] = useState<Attendee | null>(null);

  // Dynamic Pricing Engine state
  const pricingTemplate: PricingTemplate | null = (form as any)?.pricingTemplate ?? null;
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  // `selectedCountryCode` is DERIVED from `answers[<usedForPricing country field>]`.
  // Tracking it as independent state caused two stale-read bugs:
  //   1. Draft restore populated `answers` but didn't sync `selectedCountryCode` →
  //      tier resolved to nothing → pricing wouldn't recompute until user re-clicked.
  //   2. Prefill from profile only set this state, but `answers` would override it
  //      later if the form had its own country input.
  // The setter is retained for backward-compat with FormRenderer callers that want
  // to force a value (e.g. static forms without a country field in answers).
  const [selectedCountryCodeOverride, setSelectedCountryCode] = useState<string>('');
  const selectedCountryCode = (() => {
    const pricingCountryField = form?.fields?.find((f: any) => f.type === 'country' && (f as any).usedForPricing);
    if (pricingCountryField) {
      const fromAnswers = (answers[pricingCountryField.id] as string) ?? '';
      if (fromAnswers) return fromAnswers;
    }
    return selectedCountryCodeOverride;
  })();

  // Detect RMS field on the form
  const rmsField = form?.fields?.find((f: any) => f.type === 'registration-mode-selector') ?? null;

  const [registrationMode, setRegistrationMode] = useState<'individual' | 'group' | null>(null);
  // `groupSize` = number of ADDITIONAL people the purchaser is registering (1..5).
  // The purchaser themselves is always registered separately via the main form.
  const [groupSize, setGroupSize] = useState<number>(1);
  const [groupHasAllInfo, setGroupHasAllInfo] = useState<boolean>(false);
  const [groupAllSameCountry, setGroupAllSameCountry] = useState<boolean>(false);
  const [groupAllSameCategory, setGroupAllSameCategory] = useState<boolean>(false);

  // `groupMembers` now holds ONLY the additional registrants — the purchaser is
  // NOT an element of this array. Length is driven by `groupSize`.
  const [groupMembers, setGroupMembers] = useState<Array<{
    name: string;
    email: string;
    countryCode: string;
    categoryId: string | null;
    addonIds: string[];
    fullAnswers?: Record<string, any>;
  }>>([
    { name: '', email: '', countryCode: '', categoryId: null, addonIds: [] },
  ]);

  // Derived pricing values — recomputed each render
  const activeBracket = pricingTemplate ? resolveBracket(pricingTemplate, new Date()) : null;
  const activeTier = pricingTemplate ? resolveTier(pricingTemplate, selectedCountryCode) : null;
  const dynamicTotal = (pricingTemplate && activeBracket && activeTier && selectedCategoryId)
    ? computeTotal(pricingTemplate, selectedCategoryId, activeTier, activeBracket, selectedAddonIds)
    : null;

  // When in group mode, total = purchaser's own price (from main form's country/category)
  // + sum of each additional registrant's price. We prepend the purchaser's selection
  // to the list so computeGroupTotal handles the full N+1 computation atomically.
  const groupPricingResult = (pricingTemplate && registrationMode === 'group')
    ? computeGroupTotal(
        pricingTemplate,
        [
          {
            countryCode: selectedCountryCode,
            categoryId: selectedCategoryId ?? '',
            addonIds: selectedAddonIds,
          },
          ...groupMembers.map(m => ({
            countryCode: m.countryCode,
            categoryId: m.categoryId ?? '',
            addonIds: m.addonIds,
          })),
        ],
        new Date(),
      )
    : null;

  const groupTotal = (groupPricingResult && groupPricingResult.ok) ? groupPricingResult.total : null;

  // Pending-claim: group guest completing their personal details post-purchase
  const isPendingClaim = (loadedRefAttendee as any)?.guestType === 'pending-claim';
  const isExhibitorStaffPending = (loadedRefAttendee as any)?.guestType === 'exhibitor-staff-pending';
  const isAnyPendingClaim = isPendingClaim || isExhibitorStaffPending;

  // Sync groupMembers array length when groupSize changes
  useEffect(() => {
    setGroupMembers(prev => {
      if (prev.length === groupSize) return prev;
      if (prev.length < groupSize) {
        return [...prev, ...Array(groupSize - prev.length).fill(null).map(() => ({
          name: '', email: '', countryCode: '', categoryId: null, addonIds: [],
        }))];
      }
      return prev.slice(0, groupSize);
    });
  }, [groupSize]);

  // "Same country" shortcut — propagate first member's country to all
  useEffect(() => {
    if (!groupAllSameCountry) return;
    setGroupMembers(prev => {
      const first = prev[0];
      if (!first) return prev;
      return prev.map(m => ({ ...m, countryCode: first.countryCode }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupAllSameCountry, groupMembers[0]?.countryCode]);

  // "Same category" shortcut — propagate first member's category to all
  useEffect(() => {
    if (!groupAllSameCategory) return;
    setGroupMembers(prev => {
      const first = prev[0];
      if (!first) return prev;
      return prev.map(m => ({ ...m, categoryId: first.categoryId }));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupAllSameCategory, groupMembers[0]?.categoryId]);

  // Pre-fill form answers from the signed-in user's profile so we don't re-ask
  // things we already know (name, email, organization, country, phone). Runs once
  // when profile + form both exist; later user edits are preserved.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (!profile || !form || mode !== 'purchaser') return;

    const nameParts = (profile.fullName ?? '').trim().split(/\s+/);
    const firstName = nameParts.slice(0, 1).join(' ');
    const lastName = nameParts.slice(1).join(' ');

    const patch: Record<string, any> = {};
    for (const field of form.fields) {
      const id = field.id.toLowerCase();
      const label = (field.label ?? '').toLowerCase();
      if ((id.includes('fname') || label.includes('first name')) && firstName) patch[field.id] = firstName;
      else if ((id.includes('lname') || label.includes('last name')) && lastName) patch[field.id] = lastName;
      else if (field.type === 'email' && profile.email) patch[field.id] = profile.email;
      else if ((id.includes('org') || label.includes('organization')) && profile.organization) patch[field.id] = profile.organization;
      else if (field.type === 'country' && profile.countryCode) patch[field.id] = profile.countryCode;
      else if ((id.includes('phone') || id.includes('whatsapp') || field.type === 'phone') && profile.phone) patch[field.id] = profile.phone;
    }

    if (Object.keys(patch).length > 0) {
      setAnswers((prev) => ({ ...patch, ...prev }));
      if (profile.countryCode) setSelectedCountryCode(profile.countryCode);
    }
    prefilledRef.current = true;
  }, [profile, form, mode]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      if (formId) {
        const formData = await getFormById(formId);
        setForm(formData || null);
      }
      const settingsData = await getSettings();
      setSettings(settingsData);

      // Handle Guest Mode (Referral Link)
      if (guestRef && formId) {
        let refAttendee = await getAttendee(guestRef);

        // Pending-claim: group guest with guest_type='pending-claim' OR exhibitor staff with
        // guest_type='exhibitor-staff-pending' completes their own details
        const pendingClaimTypes = ['pending-claim', 'exhibitor-staff-pending'];
        if (refAttendee && pendingClaimTypes.includes((refAttendee as any).guestType) && refAttendee.formId === formId) {
          setLoadedRefAttendee(refAttendee);
          setMode('guest');
          // Pre-fill answers from whatever was saved at purchase time
          if (refAttendee.answers && Object.keys(refAttendee.answers).length > 0) {
            setAnswers(refAttendee.answers);
          }
          setLoading(false);
          setInitialLoadComplete(true);
          return;
        }

        // If the ref points to a placeholder guest (not primary), resolve up to the actual primary purchaser
        let actualPrimary = refAttendee;
        if (refAttendee && !refAttendee.isPrimary && refAttendee.primaryAttendeeId) {
          actualPrimary = await getAttendee(refAttendee.primaryAttendeeId);
        }

        if (actualPrimary && actualPrimary.isPrimary && actualPrimary.formId === formId) {
          setFetchedPrimaryAttendee(actualPrimary);

          // Calculate remaining seats from the primary attendee's purchase
          const existingGuests = await getGuestsByPrimaryId(actualPrimary.id);
          const primaryFormData = await getFormById(actualPrimary.formId);
          const ticketField = primaryFormData?.fields.find(f => f.type === 'ticket');

          // Parse the ticket type summary to find matching items and calculate total seats
          let totalSeats = 1;
          if (ticketField?.ticketConfig) {
            // The primary's ticketType is a summary like "Table x2, VIP x1"
            // We need to reverse-parse or find all items with seats > 1
            // Best approach: sum up seats from all items matching the ticketType parts
            const ticketTypeParts = actualPrimary.ticketType.split(', ');
            totalSeats = 0;
            for (const part of ticketTypeParts) {
              const match = part.match(/^(.+?)\s*x(\d+)$/);
              if (match) {
                const itemName = match[1].trim();
                const qty = parseInt(match[2], 10);
                const item = ticketField.ticketConfig.items.find(i => i.name === itemName);
                totalSeats += qty * (item?.seats || 1);
              }
            }
            // Subtract donated seats
            totalSeats -= (actualPrimary.donatedSeats || 0);
            if (totalSeats < 1) totalSeats = 1;
          }

          // Count only non-placeholder guests (those who have a real email, not the purchaser's)
          const filledGuests = existingGuests.filter(g =>
            g.name && !g.name.includes('Guest Ticket #')
          ).length;
          const currentCount = filledGuests + 1; // +1 for primary
          const remaining = totalSeats - currentCount;

          setRemainingSeats(remaining);
          setIsTableFull(remaining <= 0);
          setMode('guest');

          // Pre-fill a guest slot for the link-based registrant
          setGuests([{ name: '', email: '', dietary: 'no', guestType: 'adult' }]);
        } else {
          showNotification('Invalid or expired guest registration link.', 'error');
          setMode('purchaser');
        }
      }
      setLoading(false);
      setInitialLoadComplete(true);
    };
    fetch();
  }, [formId, guestRef]);

  const ticketField = form?.fields.find(f => f.type === 'ticket');

  // Compute ticket subtotal separately for display on payment page
  const ticketSubtotal = (() => {
    if (!ticketField?.ticketConfig) return 0;
    let subtotal = 0;
    ticketField.ticketConfig.items.forEach(item => {
      const qty = ticketQuantities[item.id] || 0;
      subtotal += item.price * qty;
    });
    let discount = 0;
    if (appliedPromo) {
      discount = appliedPromo.type === 'percent'
        ? subtotal * (appliedPromo.value / 100)
        : appliedPromo.value;
    }
    return Math.max(0, subtotal - discount);
  })();

  useEffect(() => {
    setPaymentTotal(ticketSubtotal);
  }, [ticketSubtotal]);

  // Resize guest array when ticket quantities change
  useEffect(() => {
    if (!ticketField?.ticketConfig || mode === 'guest') return;
    const totalTickets: number = ticketField.ticketConfig.items.reduce((acc: number, item) => {
      const qty = ticketQuantities[item.id] || 0;
      return acc + (qty * (item.seats || 1));
    }, 0);

    setGuests(prev => {
      if (prev.length === totalTickets) return prev;
      const newGuests = [...prev];
      if (newGuests.length < totalTickets) {
        for (let i = newGuests.length; i < totalTickets; i++) {
          newGuests.push({ name: '', email: '', dietary: 'no', guestType: 'adult' });
        }
      } else {
        newGuests.length = totalTickets;
      }
      return newGuests;
    });
  }, [ticketField, ticketQuantities]);

  // Sync first guest with purchaser details if enabled
  useEffect(() => {
    if (!form || mode === 'guest') return;

    if (isFirstGuestPurchaser && guests.length > 0) {
      const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
      const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));

      const newName = nameField ? (answers[nameField.id] || '') : '';
      const newEmail = emailField ? (answers[emailField.id] || '') : '';

      // Only update if different to avoid infinite loops
      if (guests[0].name !== newName || guests[0].email !== newEmail) {
        setGuests(prev => {
          const newGuests = [...prev];
          newGuests[0] = { ...newGuests[0], name: newName, email: newEmail };
          return newGuests;
        });
      }
    }
  }, [answers, isFirstGuestPurchaser, guests.length, form, mode]);

  const isVisible = (field: FormField) => {
    if (!field.conditional?.enabled || !field.conditional.fieldId) return true;
    const targetValue = answers[field.conditional.fieldId];
    if (targetValue === undefined || targetValue === null) return false;
    if (Array.isArray(targetValue)) {
      return targetValue.includes(field.conditional.value);
    }
    // Handle boolean comparisons where value might be 'true'/'false' string
    if (typeof targetValue === 'boolean') {
      return String(targetValue) === field.conditional.value;
    }
    return String(targetValue) === field.conditional.value;
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleQuantityChange = (itemId: string, qty: number) => {
    setTicketQuantities(prev => {
      const next = { ...prev, [itemId]: qty };
      // Sync to answers for conditional logic
      const selectedIds = Object.entries(next)
        .filter(([_, q]) => q > 0)
        .map(([id]) => id);

      if (ticketField) {
        setAnswers(prevAnswers => ({
          ...prevAnswers,
          [ticketField.id]: selectedIds
        }));
      }
      return next;
    });
  };

  const applyPromo = () => {
    if (!ticketField?.ticketConfig?.promoCodes) return;
    const found = ticketField.ticketConfig.promoCodes.find(p => p.code.toLowerCase() === promoCode.toLowerCase());
    if (found) {
      setAppliedPromo(found);
      setPromoCode(''); // Clear input
      showNotification("Promo code applied successfully", 'success');
    } else {
      showNotification("Invalid promo code", 'error');
    }
  };

  const validate = () => {
    if (!form) return false;

    const requiredCheck = validateRequired(form.fields, answers, isVisible);
    if (!requiredCheck.ok) {
      setError(requiredCheck.error!);
      return false;
    }

    const rmsCheck = validateRms(rmsField, registrationMode);
    if (!rmsCheck.ok) {
      setError(rmsCheck.error!);
      return false;
    }

    const groupCheck = validateGroupMembers(
      registrationMode,
      groupMembers,
      Boolean(pricingTemplate),
    );
    if (!groupCheck.ok) {
      setError(groupCheck.error!);
      return false;
    }

    if (mode === 'purchaser') {
      if (ticketField && ticketField.required) {
        const totalQty = Object.values(ticketQuantities).reduce((a: number, b: number) => a + b, 0);
        if (totalQty === 0) {
          setError('Please select at least one ticket.');
          return false;
        }
      }
    } else {
      if (isTableFull) {
        setError('This table is already at full capacity.');
        return false;
      }
      const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
      const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
      if (!nameField || !answers[nameField.id]) {
        setError('Please provide your name.');
        return false;
      }
      if (!emailField || !answers[emailField.id]) {
        setError('Please provide your email address.');
        return false;
      }
    }

    setError('');
    return true;
  };

  const doSubmit = async () => {
    if (!validate()) return;

    // Pending-claim: update attendee row in-place, flip guest_type to 'claimed' (or 'exhibitor-staff-claimed')
    if (isAnyPendingClaim && loadedRefAttendee) {
      setLoading(true);
      try {
        const newGuestType = isExhibitorStaffPending ? 'exhibitor-staff-claimed' : 'claimed';
        const emailMode = isExhibitorStaffPending ? 'exhibitor-staff-claim-completed' : 'guest-claim-completed';

        // If the guest is already signed in AND their auth email matches the
        // attendee row's email, backlink their user_id now. The DB trigger only
        // fires on NEW auth.users inserts, so pre-existing users would otherwise
        // stay unlinked on the attendee row after claiming.
        const claimUpdate: Record<string, any> = {
          answers,
          guest_type: newGuestType,
        };
        if (
          !isExhibitorStaffPending
          && user?.id
          && user.email
          && loadedRefAttendee.email
          && user.email.toLowerCase() === loadedRefAttendee.email.toLowerCase()
          && !(loadedRefAttendee as any).userId
        ) {
          claimUpdate.user_id = user.id;
        }
        const { error: updateError } = await supabase
          .from('attendees')
          .update(claimUpdate)
          .eq('id', loadedRefAttendee.id);

        if (updateError) {
          setError(updateError.message || 'Failed to save your registration. Please try again.');
          return;
        }

        // Optional portal signup during claim. If user opted in AND isn't already
        // signed in, create an auth user with their attendee email. The DB trigger
        // `link_attendees_to_new_user` backfills user_id on every matching
        // attendee row automatically — no client-side linking needed.
        if (claimSignupOptIn && !user && loadedRefAttendee.email && claimSignupPassword.length >= 8) {
          try {
            await supabase.auth.signUp({
              email: loadedRefAttendee.email,
              password: claimSignupPassword,
              options: {
                data: {
                  full_name: loadedRefAttendee.name ?? '',
                  role: 'attendee',
                },
                emailRedirectTo: `${window.location.origin}/#/portal`,
              },
            });
            // Verification email goes out automatically. The trigger already ran
            // on auth.users INSERT — their attendee row now has user_id set.
          } catch (signupErr) {
            console.warn('Optional portal signup during claim failed (continuing):', signupErr);
          }
        }

        // Fire-and-forget personal confirmation email via send-ticket-email.
        supabase.functions.invoke('send-ticket-email', {
          body: { mode: emailMode, attendeeId: loadedRefAttendee.id },
        }).catch(() => {/* ignore — email is best-effort */});

        setGeneratedTicket({ ...loadedRefAttendee, answers });
        // Confirmed success — wipe any cross-device draft so portal stops showing "Resume".
        if (form) clearAllProgress(form.id, user?.id ?? null);
        setStep('success');
      } catch (err: any) {
        setError(err.message || 'An unexpected error occurred. Please try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Route to payment screen if any pricing path has a non-zero total.
    // paymentTotal = static-ticket total, dynamicTotal = dynamic per-person,
    // groupTotal = dynamic group sum. Any of these > 0 means payment required.
    const hasPayableAmount = paymentTotal > 0
      || (pricingTemplate && (dynamicTotal ?? 0) > 0)
      || (pricingTemplate && registrationMode === 'group' && (groupTotal ?? 0) > 0);

    if (mode === 'purchaser' && (ticketField || pricingTemplate) && hasPayableAmount) {
      setStep('payment');
    } else {
      finalizeRegistration('free');
    }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    await doSubmit();
  };

  const finalizeRegistration = async (paymentStatus: 'paid' | 'free', transactionId?: string, paymentAmount?: string) => {
    if (!form) return;
    setLoading(true);
    setError('');

    try {
    const submissionId = crypto.randomUUID();
    const invoiceId = `INV-${Math.random().toString(10).substr(2, 6)}`;

    if (mode === 'guest' && fetchedPrimaryAttendee) {
      // In guest mode, name and email come from the form's standard fields
      const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
      const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
      const guestName = nameField ? answers[nameField.id] : 'Guest';
      const guestEmail = emailField ? answers[emailField.id] : 'unknown@example.com';

      // Determine the record to update
      const refParam = new URLSearchParams(window.location.search).get('ref');
      let existingRecord: Attendee | undefined;
      let isUpdatingPlaceholder = false;

      if (refParam) {
        const refAttendee = await getAttendee(refParam);

        // If the ref points directly to a placeholder guest, update it in-place
        if (refAttendee && !refAttendee.isPrimary) {
          existingRecord = refAttendee;
          isUpdatingPlaceholder = true;

          if (!existingRecord.name?.includes('Guest Ticket #') && existingRecord.email !== fetchedPrimaryAttendee.email) {
            throw new Error("This specific ticket link has already been claimed by a guest.");
          }
        } else if (refAttendee && refAttendee.isPrimary) {
          // If the ref points to the primary, find the first available placeholder under this primary
          const primarysGuests = await getGuestsByPrimaryId(refAttendee.id);
          const firstPlaceholder = primarysGuests.find(guest => guest.name?.includes('Guest Ticket #') || guest.email === refAttendee.email);
          if (firstPlaceholder) {
            existingRecord = firstPlaceholder;
            isUpdatingPlaceholder = true;
          } else {
            throw new Error("This registration link has already been fully claimed by all available guests. There are no remaining tickets to assign.");
          }
        }
      }

      if (!isUpdatingPlaceholder || !existingRecord) {
        throw new Error("Invalid or fully claimed registration link. We could not allocate a valid ticket for you.");
      }

      const recordId = isUpdatingPlaceholder && existingRecord ? existingRecord.id : submissionId;

      const guestAttendee: Attendee = {
        id: recordId,
        formId: form.id,
        formTitle: form.title,
        name: guestName,
        email: guestEmail,
        dietaryPreferences: '',
        guestType: 'adult',
        ticketType: `Guest of ${fetchedPrimaryAttendee.name}`,
        registeredAt: isUpdatingPlaceholder && existingRecord ? existingRecord.registeredAt : new Date().toISOString(),
        answers: answers,
        paymentStatus: isUpdatingPlaceholder && existingRecord ? existingRecord.paymentStatus : 'free',
        transactionId: isUpdatingPlaceholder && existingRecord ? existingRecord.transactionId : undefined,
        paymentAmount: isUpdatingPlaceholder && existingRecord ? existingRecord.paymentAmount : undefined,
        isPrimary: false,
        primaryAttendeeId: fetchedPrimaryAttendee.id,
        // Preserve original QR payload so the check-in QR code stays valid
        qrPayload: isUpdatingPlaceholder && existingRecord
          ? existingRecord.qrPayload
          : JSON.stringify({ id: recordId, invoiceId: fetchedPrimaryAttendee.invoiceId || invoiceId, formId: form.id, action: 'checkin' }),
        // Preserve original invoiceId from the purchase
        invoiceId: isUpdatingPlaceholder && existingRecord ? existingRecord.invoiceId : (fetchedPrimaryAttendee.invoiceId || invoiceId),
      };

      await saveAttendee(guestAttendee);
      setGeneratedTicket(guestAttendee);
      setLoading(false);
      if (form) clearAllProgress(form.id, user?.id ?? null);
      setStep('success');
      if (settings) {
        // No registration URL for already-registered guests
        const doc = await generateTicketPDF(guestAttendee, settings, form);
        setPreviewPdfUrl(doc.output('bloburl').toString());
      }
      return;
    }

    const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
    const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));

    // Construct Ticket Summary String
    let ticketTypeSummary = paymentStatus === 'paid' ? 'Paid Admission' : 'General Admission';
    if (ticketField && ticketField.ticketConfig) {
      const parts: string[] = [];
      ticketField.ticketConfig.items.forEach(item => {
        const qty = ticketQuantities[item.id] || 0;
        if (qty > 0) parts.push(`${item.name} x${qty}`);
      });
      if (parts.length > 0) ticketTypeSummary = parts.join(', ');
    }

    // Purchaser name/email from form fields (always preserved as primary)
    let purchaserName = nameField ? answers[nameField.id] : 'Guest';
    let purchaserEmail = emailField ? answers[emailField.id] : 'unknown@example.com';

    // If the user explicitly edited the first guest (Purchaser), use those details instead
    if (mode === 'purchaser' && !isFirstGuestPurchaser && guests.length > 0) {
      purchaserName = guests[0].name || purchaserName;
      purchaserEmail = guests[0].email || purchaserEmail;
    }

    const newAttendee: Attendee = {
      id: submissionId,
      formId: form.id,
      formTitle: form.title,
      name: purchaserName,
      email: purchaserEmail,
      ticketType: ticketTypeSummary,
      registeredAt: new Date().toISOString(),
      answers: answers,
      paymentStatus,
      invoiceId,
      transactionId,
      paymentAmount,
      isPrimary: true,
      qrPayload: JSON.stringify({ id: submissionId, invoiceId, formId: form.id, action: 'checkin' })
    };

    // Add dietary preferences for the primary attendee from guest slot 0
    if (ticketField?.ticketConfig?.enableGuestDetails && guests.length > 0) {
      if (guests[0].dietary) {
        newAttendee.dietaryPreferences = guests[0].dietary === 'yes' ? 'Vegetarian' : '';
      }
      if (ticketField.ticketConfig.enableAgeGroups && guests[0].guestType) {
        newAttendee.guestType = guests[0].guestType;
      }
    }

    // Add Donated Seats/Tables Info
    if (ticketField?.ticketConfig?.enableDonations && (donatedSeats > 0 || donatedTables > 0)) {
      newAttendee.donationType = donateOption === 'no' ? 'none' : donateOption;
      newAttendee.donatedTables = donatedTables;
      newAttendee.donatedSeats = donatedSeats;
    }

    const allAttendees: Attendee[] = [newAttendee];

    // Track guest ticket payloads for email attachments (resolved after payment verification)
    const guestTickets: { name: string, attendee: Attendee, registrationUrl?: string }[] = [];

    // Save Guests (Placeholders or named) — when tickets with multiple seats are purchased
    if (ticketField?.ticketConfig) {
      // Calculate total seats purchased
      const totalSeats = ticketField.ticketConfig.items.reduce((acc, item) => {
        const qty = ticketQuantities[item.id] || 0;
        return acc + (qty * (item.seats || 1));
      }, 0);

      // Subtract donations
      const seatsToGenerate = Math.max(1, totalSeats - (donatedSeats || 0));

      // Generate guest records if this purchase is for multiple seats/tickets
      if (seatsToGenerate > 1) {
        for (let i = 1; i < seatsToGenerate; i++) {
          const guestId = crypto.randomUUID();
          const g = (guests && guests[i]) ? guests[i] : null;

          // If they provided guest names and emails, use them.
          // Otherwise, create a placeholder: "Guest of [Purchaser] - Ticket #N"
          const isPlaceholder = !g || !g.name || !g.email;
          const guestName = !isPlaceholder ? g!.name : `${purchaserName} - Guest Ticket #${i + 1}`;
          const guestEmail = !isPlaceholder ? g!.email : (purchaserEmail || 'unknown@example.com');

          const guestAttendee: Attendee = {
            id: guestId,
            formId: form.id!,
            formTitle: form.title!,
            name: guestName,
            email: guestEmail,
            dietaryPreferences: g?.dietary === 'yes' ? 'Vegetarian' : '',
            guestType: g?.guestType || 'adult',
            ticketType: `Guest of ${purchaserName}`,
            registeredAt: new Date().toISOString(),
            answers: {},
            paymentStatus,
            paymentAmount: '0',
            invoiceId,
            transactionId,
            isPrimary: false,
            primaryAttendeeId: newAttendee.id,
            qrPayload: JSON.stringify({ id: guestId, invoiceId, formId: form.id, action: 'checkin' })
          };
          allAttendees.push(guestAttendee);

          // Generate PDF for this guest
          // Registration URL always points to the PRIMARY attendee so the guest flow
          // can resolve remaining seats properly.
          if (settings) {
            const registrationUrl = isPlaceholder
              ? `${window.location.origin}/#/form/${form.id}?ref=${newAttendee.id}`
              : undefined;
            guestTickets.push({ name: guestName, attendee: guestAttendee, registrationUrl });
          }
        }
      }
    }

    // Persist guest ticket data for success page rendering
    setGuestTicketsData(guestTickets);

    // All registrations go through the edge function for server-side validation
    const verifyBody: Record<string, any> = {
      mode: paymentStatus,
      formId: form.id,
      ticketQuantities,
      promoCode: appliedPromo?.code || undefined,
      donatedSeats: donatedSeats || 0,
      attendees: allAttendees.map(mapAttendeeToDb),
    };

    if (paymentStatus === 'paid') {
      verifyBody.paypalOrderId = transactionId;
    }

    // Include dynamic pricing selection when a pricing template is attached
    let pricingSelection: DynamicPricingSelection | undefined;
    if (pricingTemplate && dynamicTotal != null && selectedCategoryId && activeTier && activeBracket) {
      pricingSelection = {
        countryCode: selectedCountryCode,
        categoryId: selectedCategoryId,
        addonIds: selectedAddonIds,
        expectedTotal: dynamicTotal,
      };
    }
    if (pricingSelection) {
      verifyBody.pricingSelection = pricingSelection;
    }

    // Track IDs we generate for each group member so we can reuse them
    // post-success for PDF generation (purchaser-backup attachments + per-guest emails).
    const groupGuestRows: Array<{ id: string; name: string; email: string; qrPayload: string; isInline: boolean }> = [];

    if (pricingTemplate && registrationMode === 'group' && groupMembers.length > 0) {
      // Group mode: purchaser (main form) + N additional registrants.
      // Server's group branch requires groupPricingSelections.length >= 2, so we
      // prepend the purchaser's own selection. The purchaser is the primary
      // attendee and carries the full main-form answers; additional people are
      // guests (pending-claim unless `groupHasAllInfo` is set).
      verifyBody.groupPricingSelections = [
        {
          countryCode: selectedCountryCode,
          categoryId: selectedCategoryId ?? '',
          addonIds: selectedAddonIds,
        },
        ...groupMembers.map(m => ({
          countryCode: m.countryCode,
          categoryId: m.categoryId ?? '',
          addonIds: m.addonIds,
        })),
      ];
      verifyBody.attendees = [
        {
          ...mapAttendeeToDb(newAttendee),
          is_primary: true,
          guest_type: null,
        },
        ...groupMembers.map(m => {
          const guestId = crypto.randomUUID();
          const qrPayload = JSON.stringify({ id: guestId, invoiceId, formId: form.id, action: 'checkin' });
          groupGuestRows.push({
            id: guestId,
            name: m.name || `${purchaserName} - Guest Ticket`,
            email: m.email || '',
            qrPayload,
            isInline: !!groupHasAllInfo,
          });
          return {
            id: guestId,
            form_id: form.id,
            form_title: form.title,
            name: m.name || `${purchaserName} - Guest Ticket`,
            email: m.email || purchaserEmail,
            ticket_type: 'Registration',
            registered_at: new Date().toISOString(),
            qr_payload: qrPayload,
            is_primary: false,
            guest_type: groupHasAllInfo ? null : 'pending-claim',
            answers: groupHasAllInfo && m.fullAnswers ? m.fullAnswers : null,
            is_test: false,
          };
        }),
      ];
    }

    // Pass the current session's access_token so the edge function can derive
    // user_id server-side.  supabase.functions.invoke already forwards the
    // Authorization header automatically when a session is active, but we make
    // it explicit here to document the intent.
    const { data: { session: verifySession } } = await supabase.auth.getSession();
    const verifyAuthHeaders: Record<string, string> = verifySession?.access_token
      ? { Authorization: `Bearer ${verifySession.access_token}` }
      : {};

    const { data, error: fnError, response: fnResponse } = await supabase.functions.invoke('verify-payment', {
      body: verifyBody,
      headers: verifyAuthHeaders,
    }) as { data: any, error: any, response?: Response };

    if (fnError) {
      // For non-2xx responses, the error message is generic — read the actual error from the response body
      let detail = 'Registration failed';
      try {
        const body = await fnResponse?.json();
        detail = body?.error || fnError.message || detail;
        if (body?.diagnostic) detail += ` [diag: ${JSON.stringify(body.diagnostic)}]`;
        if (body?.details && typeof body.details === 'object') console.error('verify-payment error details:', body.details);
      } catch {
        detail = fnError.message || detail;
      }
      throw new Error(detail);
    }
    if (data?.error) throw new Error(data.error);

    if (paymentStatus === 'paid') {
      // Update local objects for PDF generation with server-verified data
      newAttendee.paymentAmount = data.amount;
      newAttendee.transactionId = data.transactionId;

      for (const gt of guestTickets) {
        gt.attendee.paymentAmount = data.amount;
        gt.attendee.transactionId = data.transactionId;
      }
    }

    setGeneratedTicket(newAttendee);

    // --- SMTP Email Integration (runs for ALL registration types) ---
    if (settings && settings.smtpUser && settings.smtpPass) {
      try {
        const attachments = [];

        // Primary Ticket PDF
        const primaryDoc = await generateTicketPDF(newAttendee, settings, form);
        attachments.push({
          filename: `${purchaserName}_Ticket.pdf`,
          content: arrayBufferToBase64(primaryDoc.output('arraybuffer')),
          contentType: 'application/pdf'
        });

        // Guest Ticket PDFs (will be empty for single-ticket or free forms)
        for (const [idx, gt] of guestTickets.entries()) {
          const guestDoc = await generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
          const isPlaceholder = gt.attendee.name.includes('Guest Ticket #');
          const safeName = isPlaceholder
            ? `Guest_${idx + 2}`
            : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
          attachments.push({
            filename: `${safeName}_Ticket.pdf`,
            content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
            contentType: 'application/pdf'
          });
        }

        // Group mode: attach PDFs for every additional registrant so the purchaser
        // gets the whole stack as a backup (matches the "main group registrant will
        // always receive every ticket as a backup" promise on the landing page).
        // Per-guest emails (with their individual PDF) are sent further below.
        const groupGuestPdfs: Array<{ guestId: string; email: string; name: string; pdfBase64: string; isInline: boolean }> = [];
        if (registrationMode === 'group' && groupGuestRows.length > 0) {
          for (const g of groupGuestRows) {
            const guestAttendee: Attendee = {
              id: g.id,
              formId: form.id,
              formTitle: form.title,
              name: g.name,
              email: g.email || purchaserEmail,
              ticketType: 'Registration',
              registeredAt: new Date().toISOString(),
              qrPayload: g.qrPayload,
              paymentStatus: 'paid',
              transactionId: newAttendee.transactionId,
              paymentAmount: newAttendee.paymentAmount,
              answers: {},
              isPrimary: false,
              primaryAttendeeId: newAttendee.id,
            };
            // Placeholder registration URL so pending-claim guests can be invited
            // from the PDF if the purchaser forwards it.
            const claimUrl = g.isInline ? undefined : `${window.location.origin}/#/form/${form.id}?ref=${g.id}`;
            const doc = await generateTicketPDF(guestAttendee, settings, form, claimUrl);
            const pdfBase64 = arrayBufferToBase64(doc.output('arraybuffer'));
            const safeName = g.name.replace(/[^a-zA-Z0-9 ]/g, '_') || 'Guest';
            attachments.push({
              filename: `${safeName}_Ticket.pdf`,
              content: pdfBase64,
              contentType: 'application/pdf',
            });
            groupGuestPdfs.push({ guestId: g.id, email: g.email, name: g.name, pdfBase64, isInline: g.isInline });
          }
        }

        // Send all tickets to the purchaser (their own + every group guest's PDF as backup)
        const hasGroupGuests = groupGuestPdfs.length > 0;
        const purchaserMessage = hasGroupGuests
          ? `Thank you for your ${paymentStatus === 'paid' ? 'purchase' : 'registration'}! Your ticket plus ${groupGuestPdfs.length} additional ${groupGuestPdfs.length === 1 ? 'ticket is' : 'tickets are'} attached as a backup. Each additional registrant will also receive their own ticket or registration link by email directly — you don't need to forward anything.`
          : `Thank you for your ${paymentStatus === 'paid' ? 'purchase' : 'registration'}! Attached ${attachments.length === 1 ? 'is your ticket' : `are your ${attachments.length} tickets`}.${guestTickets.length > 0 ? ` ${(settings.emailPurchaserGuestNote || "We've also included your guest tickets as a backup. Named guests will receive their own ticket by email directly. For any unnamed guests, you can forward their ticket or share the registration link on it so they can provide their details.")}` : ''}`;
        await sendTicketEmail(settings, {
          to: purchaserEmail,
          subject: `${form.title} Ticket(s)`,
          name: purchaserName,
          message: purchaserMessage,
          attachments
        });

        // Group-mode: send each inline registrant their own ticket directly.
        // Pending-claim registrants get a claim-link email from the server instead —
        // their ticket is issued once they complete their details via that link.
        // Template X (emailGuestConfirmedSubject/Body) is admin-configurable.
        const signupUrl = `${window.location.origin}/#/`;
        for (const g of groupGuestPdfs) {
          if (!g.isInline) continue;
          if (!g.email || g.email === purchaserEmail || g.email === 'unknown@example.com') continue;
          const subjectTpl = settings.emailGuestConfirmedSubject || 'Your ticket for {{event}} is confirmed';
          const bodyTpl = settings.emailGuestConfirmedBody || '<p>Hi {{name}},</p><p><strong>{{purchaser}}</strong> has registered you for <strong>{{event}}</strong>. Your ticket is attached.</p><p>Create a portal account here to view your ticket anytime: <a href="{{signup_url}}">{{signup_url}}</a></p>';
          const replace = (s: string) => s
            .replace(/\{\{event\}\}/g, form.title)
            .replace(/\{\{purchaser\}\}/g, purchaserName)
            .replace(/\{\{name\}\}/g, g.name)
            .replace(/\{\{signup_url\}\}/g, signupUrl);
          const safeName = g.name.replace(/[^a-zA-Z0-9 ]/g, '_') || 'Guest';
          await sendTicketEmail(settings, {
            to: g.email,
            subject: replace(subjectTpl),
            name: g.name,
            message: replace(bodyTpl),
            attachments: [{
              filename: `${safeName}_Ticket.pdf`,
              content: g.pdfBase64,
              contentType: 'application/pdf',
            }],
          });
        }

        // Also email individual named guests directly
        for (let idx = 0; idx < guestTickets.length; idx++) {
          const gt = guestTickets[idx];
          if (gt.attendee.email && gt.attendee.email !== purchaserEmail && gt.attendee.email !== 'unknown@example.com') {
            const isPlaceholder = gt.attendee.name.includes('Guest Ticket #');
            const safeName = isPlaceholder
              ? `Guest_${idx + 2}`
              : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
            const guestDoc = await generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
            const guestSubject = (settings.emailGuestSubject || 'Your Ticket for {{event}}')
              .replace(/\{\{event\}\}/g, form.title)
              .replace(/\{\{purchaser\}\}/g, purchaserName)
              .replace(/\{\{name\}\}/g, gt.attendee.name);
            const guestBody = (settings.emailGuestBody || 'Great news! {{purchaser}} has registered you for {{event}}. Your ticket is attached — please bring it with you to the event. You can scan the QR code on your ticket for entry.')
              .replace(/\{\{event\}\}/g, form.title)
              .replace(/\{\{purchaser\}\}/g, purchaserName)
              .replace(/\{\{name\}\}/g, gt.attendee.name);
            await sendTicketEmail(settings, {
              to: gt.attendee.email,
              subject: guestSubject,
              name: gt.attendee.name,
              message: guestBody,
              attachments: [{
                filename: `${safeName}_Ticket.pdf`,
                content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
                contentType: 'application/pdf'
              }]
            });
          }
        }
      } catch (emailError) {
        console.error("Failed to send emails via SMTP:", emailError);
        // Don't block registration on email failure
      }
    }

    setLoading(false);
    if (form) clearAllProgress(form.id, user?.id ?? null);
    setStep('success');

    // Generate Preview URL (Primary Ticket)
    if (settings) {
      const doc = await generateTicketPDF(newAttendee, settings, form);
      setPreviewPdfUrl(doc.output('bloburl').toString());
    }
    } catch (registrationError: any) {
      console.error('Registration failed:', registrationError);
      setError(registrationError.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
      // Stay on payment step so user can retry PayPal — don't bounce back to form
      if (step !== 'payment') {
        setStep('form');
      }
    }
  };

  // PayPal Payment Handler (Secure Server-Side Capture)
  const onPayPalApprove = async (data: any, actions: any) => {
    setError('');
    // We pass the orderID straight to our Edge Function for server-side verification and capture
    const paypalOrderId = data.orderID;
    const expectedCurrency = ticketField?.ticketConfig?.currency || "USD";
    finalizeRegistration('paid', paypalOrderId, `${paymentTotal} ${expectedCurrency}`);
  };

  // Safely access env with fallback
  const getEnvVar = (name: string): string => {
    try {
      return (import.meta as any).env[name] || "";
    } catch (e) {
      return "";
    }
  };

  // When VITE_PAYPAL_ENV=sandbox, prefer the sandbox client ID so both keys can
  // coexist in Netlify and the site flips mode by changing a single env var.
  // Falls back to the production client ID or the admin-provided value.
  const paypalEnv = (getEnvVar('VITE_PAYPAL_ENV') || 'live').toLowerCase();
  const paypalClientId = (paypalEnv === 'sandbox'
    ? (getEnvVar('VITE_PAYPAL_SANDBOX_CLIENT_ID') || getEnvVar('VITE_PAYPAL_CLIENT_ID'))
    : getEnvVar('VITE_PAYPAL_CLIENT_ID')) || settings?.paypalClientId || "";

  const downloadPdf = async () => {
    if (generatedTicket && settings) {
      const doc = await generateTicketPDF(generatedTicket, settings, form);
      doc.save(`${generatedTicket.name}_Ticket.pdf`);
    }
  };

  // While the initial fetch is in flight, show a subtle loader — NOT the "not found"
  // copy. That message only fires if the fetch has genuinely completed with no form.
  if (!initialLoadComplete || !settings) return (
    <div className="min-h-screen flex items-center justify-center bg-gansid-surface-container-lowest">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-gansid-primary animate-spin" />
        <p className="text-sm font-body text-gansid-on-surface/60">Loading your form…</p>
      </div>
    </div>
  );

  if (!form) return (
    <div className="min-h-screen flex items-center justify-center bg-gansid-surface-container-lowest">
      <div className="bg-white p-8 rounded-gansid-xl shadow-md text-center max-w-md">
        <p className="font-display text-lg font-semibold text-gansid-on-surface mb-2">Form not found</p>
        <p className="font-body text-sm text-gansid-on-surface/60">
          This registration form doesn't exist or has been removed. Please check the link and try again.
        </p>
      </div>
    </div>
  );

  if (form.status === 'closed') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-xl font-bold mb-2">{form.title}</h1>
        <p className="text-red-500">This form is currently closed for new registrations.</p>
      </div>
    </div>
  );

  if (form.formType === 'sponsor' && !guestRef) {
    return <PublicSponsorForm form={form} settings={settings} />;
  }

  if (form.formType === 'exhibitor' && !guestRef) {
    return <PublicExhibitorForm form={form} />;
  }

  const isSteppedMode = form.settings?.renderMode === 'stepped';

  return (
    <div
      className={
        isSteppedMode
          ? (isEmbedded
              ? "w-full h-full flex flex-col relative min-h-0"
              : "w-full min-h-screen py-6 md:py-10 px-3 sm:px-6 lg:px-8 flex justify-center relative portal-root bg-gradient-to-br from-gansid-surface-container-lowest via-white to-gansid-secondary/5")
          : "w-full py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center relative"
      }
      style={isSteppedMode ? undefined : {
        backgroundColor: form.settings?.transparentBackground ? 'transparent' : (form.settings?.formBackgroundColor || '#F3F4F6'),
        backgroundImage: form.settings?.formBackgroundImage ? `url(${form.settings.formBackgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Overlay to ensure readability if there's a background image */}
      {!isSteppedMode && form.settings?.formBackgroundImage && (
        <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900">Processing...</h3>
              <p className="text-gray-500">Please wait while we complete your registration.</p>
            </div>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div
          className={
            isSteppedMode
              ? (isEmbedded
                  ? 'w-full h-full flex flex-col relative z-10 min-h-0'
                  : 'w-full lg:w-[80vw] max-w-[1600px] mx-auto bg-white rounded-gansid-xl shadow-2xl flex flex-col relative z-10 overflow-hidden min-h-[640px] lg:min-h-[80vh] max-h-[calc(100vh-3rem)] self-start')
              : 'max-w-xl w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden relative z-10 border border-white/20'
          }
          style={!isSteppedMode && form.settings?.cardBackgroundImage ? {
            backgroundImage: `url(${form.settings.cardBackgroundImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          } : {}}
        >
          <div
            className={`${isSteppedMode ? 'shrink-0 px-6 py-4 md:py-5 text-center ' : 'px-8 py-6 text-center '}${form.settings?.formHeaderColor ? '' : 'bg-gansid-primary-gradient'}`}
            style={form.settings?.formHeaderColor ? { backgroundColor: form.settings.formHeaderColor } : undefined}
          >
            <h1
              className={`${isSteppedMode ? 'text-xl md:text-2xl' : 'text-3xl'} font-black mb-0.5`}
              style={{ color: form.settings?.formTitleColor || '#FFFFFF' }}
            >
              {form.settings?.formTitle || form.title}
            </h1>
            <p
              className="opacity-90 font-medium text-sm"
              style={{ color: form.settings?.formDescriptionColor || '#FFFFFF' }}
            >
              {form.description}
            </p>
          </div>

          <form onSubmit={submitForm} className={isSteppedMode ? 'flex-1 min-h-0 flex flex-col' : 'p-8 space-y-6'}>
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            {isAnyPendingClaim && (
              <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
                {isExhibitorStaffPending
                  ? 'Your organization has registered you for the GANSID Congress. Please complete your personal details below.'
                  : 'Your registration has been paid for as part of a group. Please complete your personal details below.'}
              </div>
            )}

            {!isAnyPendingClaim && mode === 'guest' && fetchedPrimaryAttendee && (
              <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex gap-3 animate-in slide-in-from-top-4">
                <UserPlus className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                <div>
                  <div className="font-bold text-indigo-900 text-sm italic mb-1">Guest Registration</div>
                  <p className="text-xs text-indigo-700 leading-relaxed">
                    You've been invited to join <strong>{fetchedPrimaryAttendee.name}'s</strong> table.
                    {remainingSeats > 0 ? (
                      <span className="block mt-1 font-medium bg-indigo-100 w-fit px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider">
                        {remainingSeats} seat{remainingSeats !== 1 ? 's' : ''} left
                      </span>
                    ) : (
                      <span className="text-red-600 font-bold block mt-1 bg-red-50 px-2 py-0.5 rounded-full text-[10px] uppercase w-fit">
                        This table is currently full
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}

            {form.settings?.renderMode === 'stepped' && (form.settings.steps?.length ?? 0) > 0 ? (
              <SteppedFormShell
                form={form}
                mode={mode}
                isVisible={isVisible}
                isAnyPendingClaim={isAnyPendingClaim}
                isPendingClaim={isPendingClaim}
                isExhibitorStaffPending={isExhibitorStaffPending}
                rmsField={rmsField}
                registrationMode={registrationMode}
                setRegistrationMode={setRegistrationMode}
                groupMembers={groupMembers}
                setGroupMembers={setGroupMembers}
                groupSize={groupSize}
                setGroupSize={setGroupSize}
                groupHasAllInfo={groupHasAllInfo}
                setGroupHasAllInfo={setGroupHasAllInfo}
                groupAllSameCountry={groupAllSameCountry}
                setGroupAllSameCountry={setGroupAllSameCountry}
                groupAllSameCategory={groupAllSameCategory}
                setGroupAllSameCategory={setGroupAllSameCategory}
                groupTotal={groupTotal}
                answers={answers}
                onFieldChange={handleInputChange}
                pricingTemplate={pricingTemplate}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                selectedAddonIds={selectedAddonIds}
                setSelectedAddonIds={setSelectedAddonIds}
                activeTier={activeTier}
                activeBracket={activeBracket}
                dynamicTotal={dynamicTotal}
                ticketQuantities={ticketQuantities}
                onQuantityChange={handleQuantityChange}
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                appliedPromo={appliedPromo}
                onApplyPromo={applyPromo}
                paymentTotal={paymentTotal}
                guests={guests}
                setGuests={setGuests}
                skipGuestDetails={skipGuestDetails}
                setSkipGuestDetails={setSkipGuestDetails}
                isFirstGuestPurchaser={isFirstGuestPurchaser}
                setIsFirstGuestPurchaser={setIsFirstGuestPurchaser}
                isTableFull={isTableFull}
                donateOption={donateOption}
                setDonateOption={setDonateOption}
                donatedSeats={donatedSeats}
                setDonatedSeats={setDonatedSeats}
                donatedTables={donatedTables}
                setDonatedTables={setDonatedTables}
                setSelectedCountryCode={setSelectedCountryCode}
                onSubmit={doSubmit}
                userId={user?.id ?? null}
                onRestoreAnswers={(restored) => setAnswers(restored)}
                onSaveAndClose={onSaveAndClose}
              />
            ) : (
              <SingleFormShell
                form={form}
                mode={mode}
                isVisible={isVisible}
                isAnyPendingClaim={isAnyPendingClaim}
                isPendingClaim={isPendingClaim}
                isExhibitorStaffPending={isExhibitorStaffPending}
                rmsField={rmsField}
                registrationMode={registrationMode}
                setRegistrationMode={setRegistrationMode}
                groupMembers={groupMembers}
                setGroupMembers={setGroupMembers}
                groupSize={groupSize}
                setGroupSize={setGroupSize}
                groupHasAllInfo={groupHasAllInfo}
                setGroupHasAllInfo={setGroupHasAllInfo}
                groupAllSameCountry={groupAllSameCountry}
                setGroupAllSameCountry={setGroupAllSameCountry}
                groupAllSameCategory={groupAllSameCategory}
                setGroupAllSameCategory={setGroupAllSameCategory}
                groupTotal={groupTotal}
                answers={answers}
                onFieldChange={handleInputChange}
                pricingTemplate={pricingTemplate}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                selectedAddonIds={selectedAddonIds}
                setSelectedAddonIds={setSelectedAddonIds}
                activeTier={activeTier}
                activeBracket={activeBracket}
                dynamicTotal={dynamicTotal}
                ticketQuantities={ticketQuantities}
                onQuantityChange={handleQuantityChange}
                promoCode={promoCode}
                setPromoCode={setPromoCode}
                appliedPromo={appliedPromo}
                onApplyPromo={applyPromo}
                paymentTotal={paymentTotal}
                guests={guests}
                setGuests={setGuests}
                skipGuestDetails={skipGuestDetails}
                setSkipGuestDetails={setSkipGuestDetails}
                isFirstGuestPurchaser={isFirstGuestPurchaser}
                setIsFirstGuestPurchaser={setIsFirstGuestPurchaser}
                isTableFull={isTableFull}
                donateOption={donateOption}
                setDonateOption={setDonateOption}
                donatedSeats={donatedSeats}
                setDonatedSeats={setDonatedSeats}
                donatedTables={donatedTables}
                setDonatedTables={setDonatedTables}
                setSelectedCountryCode={setSelectedCountryCode}
              />
            )}

            {/* Pending-claim guests can optionally create a portal account during the claim flow.
                Default ON — the DB trigger links their auth.users row back to their attendee row
                on signup, so portal access "just works" once they verify their email. */}
            {isAnyPendingClaim && !user && loadedRefAttendee?.email && !isExhibitorStaffPending && (
              <div className="mb-4 p-4 rounded-xl bg-indigo-50 border border-indigo-200 space-y-3">
                <label className="flex items-start gap-2 text-sm text-indigo-900">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={claimSignupOptIn}
                    onChange={(e) => setClaimSignupOptIn(e.target.checked)}
                  />
                  <span>
                    <strong>Create a portal account</strong> so you can view your ticket and event updates anytime.
                    <br />
                    <span className="text-xs text-indigo-700">Uses your ticket email ({loadedRefAttendee.email}). Recommended.</span>
                  </span>
                </label>
                {claimSignupOptIn && (
                  <div>
                    <label className="block text-xs font-semibold text-indigo-900 mb-1">Choose a password (min. 8 characters)</label>
                    <input
                      type="password"
                      minLength={8}
                      value={claimSignupPassword}
                      onChange={(e) => setClaimSignupPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm bg-white"
                    />
                    <p className="text-[11px] text-indigo-700 mt-1">You'll receive a verification email to activate your account.</p>
                  </div>
                )}
              </div>
            )}

            {form.settings?.renderMode !== 'stepped' && (
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={loading || (!isAnyPendingClaim && pricingTemplate != null && (!selectedCategoryId || !activeTier || !activeBracket || dynamicTotal == null)) || (!isAnyPendingClaim && registrationMode === 'group' && (!groupPricingResult?.ok || groupMembers.some(m => !m.name.trim() || !m.email.trim() || !m.countryCode || !m.categoryId))) || (isAnyPendingClaim && claimSignupOptIn && !user && !isExhibitorStaffPending && claimSignupPassword.length > 0 && claimSignupPassword.length < 8)}
                  className="w-full py-4 text-white rounded-xl font-black uppercase tracking-widest transition shadow-lg flex justify-center items-center gap-2 transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:grayscale disabled:cursor-not-allowed"
                  style={{ backgroundColor: form.settings?.formAccentColor || '#4F46E5' }}
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : isAnyPendingClaim ? (
                    <>Complete Registration <ArrowRight className="w-5 h-5" /></>
                  ) : mode === 'guest' ? (
                    <>Claim Your Ticket <ArrowRight className="w-5 h-5" /></>
                  ) : (ticketField && paymentTotal > 0) ? (
                    <>Proceed to Payment <ArrowRight className="w-5 h-5" /></>
                  ) : (form.settings?.submitButtonText || 'Register Now')}
                </button>
              </div>
            )}
          </form>
        </div>
      )}

      {step === 'payment' && (() => {
        // Resolve the actual amount being charged. Dynamic pricing stores totals in cents.
        const displayCurrency = pricingTemplate?.currency || ticketField?.ticketConfig?.currency || 'USD';
        const isGroup = pricingTemplate && registrationMode === 'group' && groupTotal != null;
        const isDynamic = pricingTemplate && dynamicTotal != null;
        const displayTotal = isGroup
          ? (groupTotal! / 100)
          : isDynamic
            ? (dynamicTotal! / 100)
            : paymentTotal;
        const displaySubtotal = isGroup || isDynamic ? displayTotal : ticketSubtotal;
        return (
        <div className={isSteppedMode
          ? "flex-1 min-h-0 w-full flex items-center justify-center p-6 overflow-y-auto"
          : "w-full flex items-center justify-center"}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Secure Payment</h2>
          <p className="text-gray-500 mb-8">Complete your purchase to receive your ticket.</p>

          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-start gap-2 mb-6 text-left">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="bg-gray-50 p-4 rounded-xl mb-8 border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">{isGroup ? `Group total (${groupMembers.length})` : 'Ticket(s) Subtotal'}</span>
              <span className="font-medium text-gray-900">{displaySubtotal.toFixed(2)} {displayCurrency}</span>
            </div>
            {appliedPromo && (
              <div className="flex justify-between items-center text-sm text-green-600 border-t border-gray-200 pt-2 mt-2">
                <span>Promo ({appliedPromo.code})</span>
                <span>Applied</span>
              </div>
            )}
            {(donatedSeats > 0 || donatedTables > 0) && (
              <div className="flex justify-between items-center text-sm text-emerald-600 border-t border-gray-200 pt-2 mt-2">
                <span>{donateOption === 'table' ? 'Donated Tables' : 'Donated Seats'}</span>
                <span>{donateOption === 'table' ? `${donatedTables} table${donatedTables !== 1 ? 's' : ''} (${donatedSeats} seats)` : `${donatedSeats} seat${donatedSeats !== 1 ? 's' : ''}`}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-bold text-indigo-600 border-t border-gray-200 pt-3 mt-3">
              <span>Total Due</span>
              <span>{displayTotal.toFixed(2)} {displayCurrency}</span>
            </div>
          </div>

          {paypalClientId ? (
            <div key={`${paypalClientId}-${displayTotal}`} className="min-h-[150px] flex flex-col gap-2">
              <PayPalScriptProvider options={{
                clientId: paypalClientId,
                currency: displayCurrency,
                components: "buttons"
              }}>
                <PayPalButtons
                  style={{
                    layout: "vertical",
                    shape: "rect",
                    tagline: false
                  }}
                  createOrder={(data, actions) => {
                    if (pricingTemplate && registrationMode === 'group' && groupTotal != null) {
                      return actions.order.create({
                        purchase_units: [{ amount: { currency_code: pricingTemplate.currency, value: (groupTotal / 100).toFixed(2) } }],
                        intent: 'CAPTURE',
                      });
                    }
                    if (pricingTemplate && dynamicTotal != null) {
                      return actions.order.create({
                        purchase_units: [{
                          amount: {
                            currency_code: pricingTemplate.currency,
                            value: (dynamicTotal / 100).toFixed(2),
                          },
                        }],
                        intent: 'CAPTURE',
                      });
                    }
                    return actions.order.create({
                      intent: "CAPTURE",
                      purchase_units: [
                        {
                          amount: {
                            currency_code: ticketField?.ticketConfig?.currency || "USD",
                            value: paymentTotal.toFixed(2),
                          }
                        }
                      ],
                      application_context: {
                        shipping_preference: "NO_SHIPPING"
                      }
                    });
                  }}
                  onApprove={onPayPalApprove}
                  onCancel={() => {
                    setError("Payment was cancelled. You can try again when you're ready.");
                  }}
                  onError={(err) => {
                    console.error("PayPal Error:", err);
                    setError("Something went wrong with PayPal. Please try again or contact the event organizer.");
                  }}
                />
              </PayPalScriptProvider>
              {/* Debug: show both ends of the client ID so we can verify which app is in use */}
              <div className="text-[10px] text-gray-400 mt-2 italic">
                Payment Instance ID: {paypalClientId.substring(0, 8)}…{paypalClientId.slice(-6)}
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 text-amber-700 rounded-lg text-sm flex flex-col gap-2">
              <AlertCircle className="w-5 h-5" />
              <p className="font-bold">PayPal Configuration Missing</p>
              <p>Please ensure VITE_PAYPAL_CLIENT_ID is set in your .env.local file or provided in the Admin Settings.</p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">Safe and secure payments.</p>
        </div>
        </div>
        );
      })()}

      {step === 'success' && generatedTicket && (
        <div className={isSteppedMode
          ? "flex-1 min-h-0 w-full flex items-start sm:items-center justify-center p-6 overflow-y-auto"
          : "w-full flex items-center justify-center"}>
        <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in-up relative z-10 mx-auto">
          {/* ── Success Header ── */}
          <div
            className="w-full h-48 flex flex-col items-center justify-center text-white"
            style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg animate-bounce-slow"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
            >
              <Check className="w-10 h-10 text-white" style={{ color: form.settings?.successIconColor || '#10B981' }} />
            </div>
            <h3 className="text-3xl font-black px-4" style={{ color: form.settings?.successIconColor || '#10B981' }}>
              {form.settings?.successTitle || 'Registration Confirmed!'}
            </h3>
          </div>

          <div className="p-8 text-center">

            {/* ── Custom Thank You Message ── */}
            {form.thankYouMessage ? (
              <div
                className="prose prose-sm max-w-none text-gray-600 mb-6"
                dangerouslySetInnerHTML={{ __html: form.thankYouMessage }}
              />
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">You're going!</h2>
                <p className="text-gray-500 mb-6">A confirmation email with your ticket{guestTicketsData.length > 0 ? 's' : ''} has been sent to <span className="font-semibold">{generatedTicket.email}</span>.</p>
              </>
            )}

            {/* ── Your Ticket Card ── */}
            {(form.settings?.showQrOnSuccess !== false) && (
              <div
                className="border border-gray-200 rounded-2xl p-8 shadow-md mb-8 max-w-sm mx-auto relative overflow-hidden transform transition hover:scale-[1.02] duration-300"
                style={{ backgroundColor: form.settings?.successFooterColor || '#F9FAFB' }}
              >
                <div
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5', opacity: 0.3 }}
                ></div>
                <h4 className="font-bold text-xl text-gray-900 mb-1">{form.title}</h4>
                <p className="text-xs text-gray-500 mb-6 uppercase tracking-widest font-semibold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

                <div className="bg-white p-3 rounded-2xl inline-block mb-6 shadow-sm border border-gray-100">
                  <QRCode value={generatedTicket.qrPayload} size={160} />
                </div>

                <div className="text-sm font-mono bg-white p-3 rounded-xl border border-gray-200 text-gray-700 mb-4 flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Ticket ID</span>
                  <span className="font-bold">#{generatedTicket.id.slice(0, 8)}</span>
                </div>

                <div className="text-sm font-mono bg-white p-3 rounded-xl border border-gray-200 text-gray-700 mb-6 flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Attendee</span>
                  <span className="font-semibold truncate ml-4">{generatedTicket.name}</span>
                </div>

                {(form.settings?.showTicketButtonOnSuccess !== false) && (
                  <button
                    onClick={downloadPdf}
                    className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition transform hover:scale-[1.02]"
                    style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
                  >
                    <Download className="w-5 h-5 inline mr-2" /> Download Your Ticket
                  </button>
                )}
              </div>
            )}

            {/* ── Guest Tickets Section (only if guests exist) ── */}
            {generatedTicket.isPrimary && mode === 'purchaser' && guestTicketsData.length > 0 && (
              <div className="mt-8 text-left">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-indigo-600" />
                    <h3 className="font-bold text-gray-900 text-lg">Guest Tickets ({guestTicketsData.length})</h3>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      if (settings) {
                        for (const [idx, gt] of guestTicketsData.entries()) {
                          const doc = await generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
                          const safeName = gt.attendee.name.includes('Guest Ticket #')
                            ? `Guest_${idx + 2}`
                            : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');
                          doc.save(`${safeName}_Ticket.pdf`);
                        }
                      }
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition"
                  >
                    <Download className="w-4 h-4" /> Download All Guest Tickets
                  </button>
                </div>

                <p className="text-sm text-gray-500 mb-4">
                  Unclaimed guests can register using the link on their ticket, or be registered manually at check-in.
                </p>

                <div className="grid gap-4 overflow-hidden">
                  {guestTicketsData.map((gt, idx) => {
                    const isUnclaimed = gt.attendee.name.includes('Guest Ticket #');
                    const displayName = isUnclaimed ? `Guest #${idx + 2}` : gt.attendee.name;
                    const safeName = isUnclaimed
                      ? `Guest_${idx + 2}`
                      : gt.attendee.name.replace(/[^a-zA-Z0-9 ]/g, '_');

                    return (
                      <div
                        key={gt.attendee.id}
                        className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-start gap-3 overflow-hidden"
                      >
                        <div className="bg-white p-2 rounded-lg border border-gray-100 flex-shrink-0">
                          <QRCode value={gt.attendee.qrPayload} size={56} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-900 truncate">{displayName}</span>
                            {isUnclaimed ? (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-full flex-shrink-0">Unclaimed</span>
                            ) : (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full flex-shrink-0">Registered</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 font-mono">#{gt.attendee.id.slice(0, 8)}</p>

                          {isUnclaimed && gt.registrationUrl && (
                            <div className="mt-2 flex gap-2 items-center">
                              <div className="flex-1 bg-white px-2 py-1.5 rounded border border-indigo-200 text-[10px] font-mono text-indigo-600 truncate">
                                {gt.registrationUrl}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(gt.registrationUrl!);
                                  showNotification('Link copied!', 'success');
                                }}
                                className="p-1.5 bg-white border border-indigo-200 rounded hover:bg-indigo-50 transition flex-shrink-0"
                                title="Copy registration link"
                              >
                                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                              </button>
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={async () => {
                            if (settings) {
                              const doc = await generateTicketPDF(gt.attendee, settings, form, gt.registrationUrl);
                              doc.save(`${safeName}_Ticket.pdf`);
                            }
                          }}
                          className="p-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition flex-shrink-0"
                          title={`Download ${displayName} ticket`}
                        >
                          <Download className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Fallback Buttons if QR is hidden ── */}
            {form.settings?.showQrOnSuccess === false && (
              <div className="flex flex-col gap-3 mb-8">
                {form.settings?.showTicketButtonOnSuccess !== false && (
                  <button
                    onClick={downloadPdf}
                    className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition"
                    style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
                  >
                    <Download className="w-5 h-5 inline mr-2" /> Download PDF Ticket
                  </button>
                )}
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="w-full py-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-black uppercase tracking-widest transition"
                >
                  <Eye className="w-4 h-4 inline mr-2" /> View Ticket Preview
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-3 mb-6">
            {onComplete && (
              <button
                type="button"
                onClick={onComplete}
                className="px-8 py-3 rounded-full bg-gansid-primary-gradient text-white font-display font-bold shadow-lg hover:scale-[1.02] transition-all"
              >
                Return to Portal Dashboard
              </button>
            )}
            <button
              onClick={() => onComplete ? onComplete() : window.location.reload()}
              className="text-gray-500 text-sm font-medium hover:text-gray-900 underline"
            >
              {onComplete ? 'Close' : 'Start New Registration'}
            </button>
          </div>
        </div>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPreviewModal && previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col relative">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg">Ticket Preview</h3>
              <button onClick={() => setShowPreviewModal(false)} className="text-gray-500 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 bg-gray-100 p-4 overflow-hidden">
              <iframe src={previewPdfUrl} className="w-full h-full rounded-lg border border-gray-300" title="Ticket PDF"></iframe>
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 text-gray-600">Close</button>
              <button onClick={downloadPdf} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium flex items-center gap-2">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicRegistration;