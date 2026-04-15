import React, { useState, useMemo } from 'react';
import { PayPalScriptProvider, PayPalButtons } from '@paypal/react-paypal-js';
import { Check, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Form, AppSettings, TicketItem, SponsorItemCategory } from '../../types';
import { supabase } from '../../services/supabaseClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  form: Form;
  settings: AppSettings;
}

interface ContactFields {
  orgName: string;
  contactName: string;
  contactTitle: string;
  email: string;
  phone: string;
  address: string;
  website: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtCAD = (cents: number) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents);

const CATEGORY_LABELS: Record<SponsorItemCategory, string> = {
  package: 'Sponsorship Packages',
  scholarship: 'Scholarships',
  ad: 'Magazine Advertising',
  booth: 'Booth Space',
};

const CATEGORY_ORDER: SponsorItemCategory[] = ['package', 'scholarship', 'ad', 'booth'];

// Award eligibility lists
const GOLD_AWARDS = ['Nursing', 'Humanitarian'];
const SILVER_AWARDS = ['Allied Health', 'Community', 'Legislative', 'Tribute', 'Media', 'Volunteer'];
const ALL_AWARDS = ['Medical', 'Humanitarian', 'Best Hospital', 'Nursing', 'Allied Health', 'Community', 'Legislative', 'Tribute', 'Media', 'Volunteer'];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface TierCardProps {
  item: TicketItem;
  selected: boolean;
  onSelect: () => void;
}

const TierCard: React.FC<TierCardProps> = ({ item, selected, onSelect }) => {
  const [open, setOpen] = useState(false);
  return (
    <div
      onClick={onSelect}
      className={`relative rounded-2xl border-2 cursor-pointer transition-all duration-200 p-5 ${
        selected
          ? 'border-red-600 bg-red-50 shadow-lg'
          : 'border-gray-200 bg-white hover:border-red-300 hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                selected ? 'border-red-600 bg-red-600' : 'border-gray-300 bg-white'
              }`}
            >
              {selected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </span>
            <h3 className="font-bold text-gray-900 text-base leading-tight">{item.name}</h3>
          </div>
          {item.description && (
            <p className="text-sm text-gray-500 ml-7 mb-1">{item.description}</p>
          )}
          {item.seats ? (
            <p className="text-xs text-gray-400 ml-7">{item.seats} seats included</p>
          ) : null}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-xl font-extrabold text-gray-900">{fmtCAD(item.price)}</span>
          <p className="text-xs text-gray-400">CAD</p>
        </div>
      </div>

      {item.benefits && item.benefits.length > 0 && (
        <div className="mt-3 ml-7">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            className="flex items-center gap-1 text-xs text-red-600 font-semibold hover:underline"
          >
            {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {open ? 'Hide benefits' : 'View benefits'}
          </button>
          {open && (
            <ul className="mt-2 space-y-1">
              {item.benefits.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <Check className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

interface QtyStepperProps {
  item: TicketItem;
  qty: number;
  onChange: (qty: number) => void;
}

const QtyStepper: React.FC<QtyStepperProps> = ({ item, qty, onChange }) => (
  <div className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white hover:border-red-300 transition">
    <div className="flex-1 min-w-0">
      <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
      {item.description && <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>}
      <p className="text-sm font-bold text-gray-800 mt-1">{fmtCAD(item.price)} each</p>
    </div>
    <div className="flex items-center gap-2 flex-shrink-0">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, qty - 1))}
        disabled={qty === 0}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 font-bold text-lg leading-none"
      >
        −
      </button>
      <span className="w-6 text-center font-bold text-gray-900">{qty}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(item.maxPerOrder, qty + 1))}
        disabled={qty >= item.maxPerOrder}
        className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 font-bold text-lg leading-none"
      >
        +
      </button>
    </div>
    {qty > 0 && (
      <span className="text-sm font-bold text-red-600 w-24 text-right flex-shrink-0">
        {fmtCAD(item.price * qty)}
      </span>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const PublicSponsorForm: React.FC<Props> = ({ form, settings }) => {
  // ── Derive ticket items from the form's ticket field ──────────────────────
  const ticketField = form.fields.find((f) => f.type === 'ticket');
  const allItems: TicketItem[] = ticketField?.ticketConfig?.items ?? [];
  const currency = ticketField?.ticketConfig?.currency ?? 'CAD';

  // Separate packages (radio) from addons (qty steppers)
  const packages = allItems.filter((i) => i.itemCategory === 'package');
  const addons = allItems.filter((i) => i.itemCategory !== 'package');

  // ── State ──────────────────────────────────────────────────────────────────
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);
  const [addonQtys, setAddonQtys] = useState<Record<string, number>>({});
  const [awardCategory, setAwardCategory] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactFields>({
    orgName: '',
    contactName: '',
    contactTitle: '',
    email: '',
    phone: '',
    address: '',
    website: '',
  });
  const [errors, setErrors] = useState<Partial<ContactFields & { package: string; award: string }>>({});
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [chequeSelected, setChequeSelected] = useState(false);

  // ── Derived totals ─────────────────────────────────────────────────────────
  const selectedPackage = packages.find((p) => p.id === selectedPackageId) ?? null;

  const ticketQuantities = useMemo(() => {
    const q: Record<string, number> = {};
    if (selectedPackageId) q[selectedPackageId] = 1;
    for (const [id, qty] of Object.entries(addonQtys)) {
      if (qty > 0) q[id] = qty;
    }
    return q;
  }, [selectedPackageId, addonQtys]);

  const total = useMemo(() => {
    let t = selectedPackage ? selectedPackage.price : 0;
    for (const item of addons) {
      t += item.price * (addonQtys[item.id] ?? 0);
    }
    return t;
  }, [selectedPackage, addons, addonQtys]);

  // Fix 2 — HST on booth items
  const boothSubtotal = useMemo(() => {
    let sub = 0;
    for (const item of addons.filter((a) => a.itemCategory === 'booth')) {
      sub += item.price * (addonQtys[item.id] ?? 0);
    }
    return sub;
  }, [addons, addonQtys]);

  const hst = boothSubtotal * (settings.sponsorHstRate || 0.13);
  const totalWithHst = total + hst;

  // Fix 1 — Award eligibility
  const eligibleAwards = (() => {
    if (selectedPackageId === 'tier-gold') return GOLD_AWARDS;
    if (selectedPackageId === 'tier-silver') return SILVER_AWARDS;
    if (selectedPackageId === 'tier-award') return ALL_AWARDS;
    return [];
  })();
  const requiresAwardSelection = eligibleAwards.length > 0;

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const e: any = {};
    if (!contact.orgName.trim()) e.orgName = 'Organization name is required';
    if (!contact.contactName.trim()) e.contactName = 'Contact name is required';
    if (!contact.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email))
      e.email = 'Valid email is required';
    if (!selectedPackageId && total === 0) e.package = 'Please select a sponsorship package or add-on';
    if (requiresAwardSelection && !awardCategory) e.award = 'Please choose an award category';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Fix 3 — sponsorMeta helpers
  const tierItemIdToSponsorTier = (id: string | null): 'signature' | 'gold' | 'silver' | 'award' | 'scholarship' | null => {
    if (id === 'tier-signature') return 'signature';
    if (id === 'tier-gold') return 'gold';
    if (id === 'tier-silver') return 'silver';
    if (id === 'tier-award') return 'award';
    if (id === 'item-scholarship') return 'scholarship';
    return null;
  };

  const buildSponsorMeta = () => {
    const selectedItems = allItems.filter((i) => (ticketQuantities[i.id] ?? 0) > 0);
    const items = selectedItems.map((i) => ({
      type: (i.itemCategory ?? 'package') as 'package' | 'scholarship' | 'ad' | 'booth',
      key: i.id,
      label: i.name,
      qty: ticketQuantities[i.id] ?? 0,
      unitPrice: i.price,
      subtotal: i.price * (ticketQuantities[i.id] ?? 0),
    }));
    return {
      tier: tierItemIdToSponsorTier(selectedPackageId),
      items,
      companyInfo: {
        orgName: contact.orgName,
        contactName: contact.contactName,
        contactTitle: contact.contactTitle,
        email: contact.email,
        phone: contact.phone,
        address: contact.address,
        website: contact.website,
      },
      sponsoredAwards: awardCategory ? [awardCategory] : [],
      total: totalWithHst,
      hst,
    };
  };

  // Fix 4 — Submit via verify-payment edge function (cheque path)
  const submitCheque = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const primaryAttendee = {
        id: crypto.randomUUID(),
        form_id: form.id,
        form_title: form.title,
        name: contact.orgName,
        email: contact.email,
        ticket_type: allItems
          .filter((i) => (ticketQuantities[i.id] ?? 0) > 0)
          .map((i) => `${i.name} x${ticketQuantities[i.id]}`)
          .join(', '),
        registered_at: new Date().toISOString(),
        qr_payload: '',
        is_primary: true,
        is_test: false,
        invoice_id: `SPO-${Date.now()}`,
      };
      primaryAttendee.qr_payload = JSON.stringify({ id: primaryAttendee.id });

      const { data: resp, error: fnError } = await supabase.functions.invoke('verify-payment', {
        body: {
          formId: form.id,
          paymentMethod: 'cheque',
          sponsorMeta: buildSponsorMeta(),
          attendees: [primaryAttendee],
          mode: 'cheque',
        },
      });
      if (fnError || resp?.error) {
        throw new Error(resp?.error || fnError?.message || 'Pledge submission failed');
      }
      setChequeSelected(true);
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Fix 4 — Submit via verify-payment edge function (PayPal path)
  const paypalClientId = settings?.paypalClientId || '';

  const onPayPalApprove = async (data: { orderID: string }) => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const primaryAttendee = {
        id: crypto.randomUUID(),
        form_id: form.id,
        form_title: form.title,
        name: contact.orgName,
        email: contact.email,
        ticket_type: allItems
          .filter((i) => (ticketQuantities[i.id] ?? 0) > 0)
          .map((i) => `${i.name} x${ticketQuantities[i.id]}`)
          .join(', '),
        registered_at: new Date().toISOString(),
        qr_payload: '',
        is_primary: true,
        is_test: false,
        invoice_id: `SPO-${Date.now()}`,
      };
      primaryAttendee.qr_payload = JSON.stringify({ id: primaryAttendee.id });

      const { data: resp, error: fnError } = await supabase.functions.invoke('verify-payment', {
        body: {
          formId: form.id,
          paypalOrderId: data.orderID,
          paymentMethod: 'paypal',
          sponsorMeta: buildSponsorMeta(),
          attendees: [primaryAttendee],
          mode: 'paid',
        },
      });
      if (fnError || resp?.error) {
        throw new Error(resp?.error || fnError?.message || 'Payment verification failed');
      }
      setStep('success');
    } catch (err: any) {
      setSubmitError(err.message ?? 'Payment verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Grouped addons by category ─────────────────────────────────────────────
  const addonGroups: { category: SponsorItemCategory; items: TicketItem[] }[] = CATEGORY_ORDER
    .filter((cat) => cat !== 'package')
    .map((cat) => ({ category: cat, items: addons.filter((i) => i.itemCategory === cat) }))
    .filter((g) => g.items.length > 0);

  const accentColor = form.settings?.formAccentColor ?? '#C8262A';

  // ── Success screen ─────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: accentColor }}
          >
            <Check className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 mb-2">
            {form.settings?.successTitle ?? 'Thank you for your sponsorship!'}
          </h1>
          <p className="text-gray-500 mb-6">
            {chequeSelected
              ? 'Your pledge has been recorded. Please make your cheque payable to SCAGO and mail to the address on the invoice.'
              : "We've received your sponsorship commitment. Our team will be in touch within 2 business days."}
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-left text-sm text-gray-700 space-y-1">
            <p>
              <span className="font-semibold">Organization:</span> {contact.orgName}
            </p>
            <p>
              <span className="font-semibold">Contact:</span> {contact.contactName}
            </p>
            <p>
              <span className="font-semibold">Total:</span> {fmtCAD(totalWithHst)} CAD
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Payment screen ─────────────────────────────────────────────────────────
  if (step === 'payment') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
          <h2 className="text-xl font-extrabold text-gray-900 mb-1">Complete Your Sponsorship</h2>
          <p className="text-sm text-gray-500 mb-6">
            {contact.orgName} — {fmtCAD(totalWithHst)} CAD
          </p>

          {submitError && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex gap-2 items-start">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="space-y-4">
            {/* PayPal */}
            {paypalClientId ? (
              <div key={`${paypalClientId}-${totalWithHst}`}>
                <p className="text-xs text-gray-400 mb-2 font-semibold uppercase tracking-wide">
                  Pay online
                </p>
                <PayPalScriptProvider
                  options={{ clientId: paypalClientId, currency, components: 'buttons' }}
                >
                  <PayPalButtons
                    style={{ layout: 'vertical', shape: 'rect', tagline: false }}
                    createOrder={(_data, actions) =>
                      actions.order.create({
                        intent: 'CAPTURE',
                        purchase_units: [
                          {
                            amount: { currency_code: currency, value: totalWithHst.toFixed(2) },
                            description: `Sponsorship – ${form.title}`,
                          },
                        ],
                        application_context: { shipping_preference: 'NO_SHIPPING' },
                      })
                    }
                    onApprove={onPayPalApprove}
                    onCancel={() =>
                      setSubmitError('Payment was cancelled. You can try again when ready.')
                    }
                    onError={(err) => {
                      console.error('PayPal error', err);
                      setSubmitError(
                        'Something went wrong with PayPal. Please try again or contact us.'
                      );
                    }}
                  />
                </PayPalScriptProvider>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">
                PayPal is not configured. Please use the cheque option below.
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3">
              <hr className="flex-1 border-gray-200" />
              <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">or</span>
              <hr className="flex-1 border-gray-200" />
            </div>

            {/* Cheque pledge */}
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setChequeSelected(true);
                submitCheque();
              }}
              className="w-full py-3 rounded-xl border-2 border-gray-300 text-gray-700 font-bold hover:border-gray-400 hover:bg-gray-50 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting && chequeSelected ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : null}
              Pay by Cheque (Pledge)
            </button>
            <p className="text-xs text-gray-400 text-center">
              Submits a pledge. Cheque payable to <strong>SCAGO</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setStep('form')}
            className="mt-6 text-sm text-gray-500 hover:underline w-full text-center"
          >
            ← Back to form
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero header */}
      <div
        className="py-12 px-6 text-white text-center"
        style={{ backgroundColor: accentColor }}
      >
        <h1 className="text-3xl font-extrabold mb-2">{form.settings?.formTitle ?? form.title}</h1>
        <p className="text-white/80 max-w-xl mx-auto text-base">{form.description}</p>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-10 space-y-10">
        {/* Contact info */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-5">Organization Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(
              [
                { key: 'orgName', label: 'Organization Name', required: true, span: 2 },
                { key: 'contactName', label: 'Contact Name', required: true },
                { key: 'contactTitle', label: 'Contact Title', required: false },
                { key: 'email', label: 'Email Address', required: true, type: 'email' },
                { key: 'phone', label: 'Phone', required: false, type: 'tel' },
                { key: 'address', label: 'Mailing Address', required: false, span: 2 },
                { key: 'website', label: 'Website', required: false, type: 'url' },
              ] as Array<{
                key: keyof ContactFields;
                label: string;
                required: boolean;
                type?: string;
                span?: number;
              }>
            ).map(({ key, label, required, type, span }) => (
              <div key={key} className={span === 2 ? 'sm:col-span-2' : ''}>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  {label}
                  {required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <input
                  type={type ?? 'text'}
                  value={contact[key]}
                  onChange={(e) => {
                    setContact((prev) => ({ ...prev, [key]: e.target.value }));
                    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
                  }}
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:ring-2 transition ${
                    errors[key]
                      ? 'border-red-400 focus:ring-red-200'
                      : 'border-gray-200 focus:ring-red-100 focus:border-red-400'
                  }`}
                />
                {errors[key] && (
                  <p className="text-xs text-red-500 mt-1">{errors[key]}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Sponsorship packages */}
        {packages.length > 0 && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Sponsorship Packages</h2>
            <p className="text-sm text-gray-500 mb-5">Choose one package (optional if adding items below)</p>
            {errors.package && (
              <p className="text-sm text-red-500 mb-3 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {errors.package}
              </p>
            )}
            <div className="space-y-3">
              {packages.map((pkg) => (
                <TierCard
                  key={pkg.id}
                  item={pkg}
                  selected={selectedPackageId === pkg.id}
                  onSelect={() => {
                    setSelectedPackageId((prev) => (prev === pkg.id ? null : pkg.id));
                    setAwardCategory(null);
                    setErrors((prev) => ({ ...prev, package: undefined, award: undefined }));
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Fix 1 — Award Category section */}
        {requiresAwardSelection && (
          <section className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Award Category</h2>
            <p className="text-sm text-gray-500 mb-4">Choose which Award of Excellence your sponsorship supports:</p>
            {errors.award && (
              <p className="text-sm text-red-500 mb-3 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {errors.award}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {eligibleAwards.map((a) => (
                <label
                  key={a}
                  className={`px-4 py-2 rounded-full border-2 cursor-pointer text-sm font-medium ${
                    awardCategory === a
                      ? 'border-red-600 bg-red-50 text-red-700'
                      : 'border-gray-200 text-gray-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="award"
                    className="sr-only"
                    checked={awardCategory === a}
                    onChange={() => {
                      setAwardCategory(a);
                      setErrors((prev) => ({ ...prev, award: undefined }));
                    }}
                  />
                  {a}
                </label>
              ))}
            </div>
          </section>
        )}

        {/* Add-ons grouped by category */}
        {addonGroups.map(({ category, items }) => (
          <section key={category} className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-5">
              {CATEGORY_LABELS[category] ?? category}
            </h2>
            <div className="space-y-3">
              {items.map((item) => (
                <QtyStepper
                  key={item.id}
                  item={item}
                  qty={addonQtys[item.id] ?? 0}
                  onChange={(qty) =>
                    setAddonQtys((prev) => ({ ...prev, [item.id]: qty }))
                  }
                />
              ))}
            </div>
          </section>
        ))}

        {/* Order summary + CTA */}
        <section className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Summary</h2>
          {total === 0 ? (
            <p className="text-sm text-gray-400">No items selected yet.</p>
          ) : (
            <div className="space-y-2 text-sm text-gray-700">
              {selectedPackage && (
                <div className="flex justify-between">
                  <span>{selectedPackage.name}</span>
                  <span className="font-semibold">{fmtCAD(selectedPackage.price)}</span>
                </div>
              )}
              {addons.map((item) => {
                const qty = addonQtys[item.id] ?? 0;
                if (!qty) return null;
                return (
                  <div key={item.id} className="flex justify-between">
                    <span>
                      {item.name} × {qty}
                    </span>
                    <span className="font-semibold">{fmtCAD(item.price * qty)}</span>
                  </div>
                );
              })}
              {/* Fix 2 — HST line */}
              {hst > 0 && (
                <div className="flex justify-between text-gray-500 pt-2 border-t border-gray-100">
                  <span>HST on booth ({((settings.sponsorHstRate || 0.13) * 100).toFixed(0)}%)</span>
                  <span>{fmtCAD(hst)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold text-gray-900 border-t border-gray-100 pt-3 mt-3">
                <span>Total</span>
                <span>{fmtCAD(totalWithHst)} CAD</span>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={total === 0}
            onClick={() => {
              if (validate()) setStep('payment');
            }}
            className="mt-6 w-full py-3.5 rounded-xl text-white font-bold text-base transition hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ backgroundColor: total === 0 ? '#9ca3af' : accentColor }}
          >
            {form.settings?.submitButtonText ?? 'Proceed to Payment'}
          </button>
        </section>
      </div>
    </div>
  );
};

export default PublicSponsorForm;
