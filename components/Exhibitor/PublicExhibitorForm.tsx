import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import type { Form } from '../../types';
import { EXHIBITOR_TIERS, getExhibitorTier } from '../../config/formTemplates/buildGansidExhibitor';
import ConsentCheckbox from '../Consent/ConsentCheckbox';
import ExhibitorStaffRow from './ExhibitorStaffRow';
import { supabase } from '../../services/supabaseClient';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  category: 'hall_only' | 'full_congress';
}

interface Props {
  form: Form;
}

export default function PublicExhibitorForm({ form }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Tier
  const [tierId, setTierId] = useState<string | null>(null);
  const tier = tierId ? getExhibitorTier(tierId) : null;

  // Additional m²
  const [wantsAdditionalSqm, setWantsAdditionalSqm] = useState(false);
  const [additionalSqm, setAdditionalSqm] = useState<number | null>(null);

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const hallOnlyStaff = staff.filter(s => s.category === 'hall_only');
  const fullCongressStaff = staff.filter(s => s.category === 'full_congress');

  // Consents
  const [consentTerms, setConsentTerms] = useState(false);
  const [consentDisclaimer, setConsentDisclaimer] = useState(false);
  const [consentPhoto, setConsentPhoto] = useState(false);

  const addStaff = (category: 'hall_only' | 'full_congress') => {
    if (!tier) return;
    const limit = category === 'hall_only' ? tier.hallOnlyQuota : tier.fullCongressQuota;
    const current = staff.filter(s => s.category === category).length;
    if (current >= limit) return;
    setStaff(prev => [...prev, {
      id: `staff_${Date.now()}_${prev.length}`,
      name: '', email: '', category,
    }]);
  };

  const updateStaff = (id: string, patch: { name?: string; email?: string }) => {
    setStaff(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeStaff = (id: string) => {
    setStaff(prev => prev.filter(s => s.id !== id));
  };

  const canSubmit = (
    orgName.trim() &&
    contactName.trim() &&
    contactEmail.trim() &&
    tier &&
    staff.length > 0 &&
    staff.every(s => s.name.trim() && s.email.trim()) &&
    consentTerms && consentDisclaimer && consentPhoto
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !tier) return;
    setSubmitting(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('verify-payment', {
        body: {
          mode: 'paid',
          formId: form.id,
          exhibitorSubmission: true,
          staffFormId: (form.settings as any)?.staffFormId,
          org: {
            orgName: orgName.trim(),
            tier: tier.id,
            additionalSqm: wantsAdditionalSqm ? (additionalSqm ?? 0) : null,
            contactName: contactName.trim(),
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone.trim() || null,
          },
          staff: staff.map(s => ({
            name: s.name.trim(),
            email: s.email.trim(),
            category: s.category,
          })),
        },
      });

      if (fnError) {
        setError(fnError.message || 'Failed to register');
        return;
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
      <div className="max-w-2xl mx-auto p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Registration complete</h1>
        <p className="text-slate-600">
          Thank you for registering <strong>{orgName}</strong>. Your {staff.length} staff member{staff.length === 1 ? '' : 's'} will receive invitation emails shortly to complete their personal registration details.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{form.title}</h1>
        {form.description && <p className="text-slate-600 mt-1">{form.description}</p>}
      </header>

      {/* Section 1: Organization info */}
      <section className="space-y-3 border rounded-xl p-5">
        <h2 className="font-semibold">Organization information</h2>
        <label className="block">
          <span className="text-sm font-medium">Organization Name *</span>
          <input type="text" required value={orgName} onChange={e => setOrgName(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Person Name *</span>
          <input type="text" required value={contactName} onChange={e => setContactName(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Email *</span>
          <input type="email" required value={contactEmail} onChange={e => setContactEmail(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Contact Phone</span>
          <input type="tel" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
            className="mt-1 w-full border rounded-lg px-3 py-2" />
        </label>
      </section>

      {/* Section 2: Tier selection */}
      <section className="space-y-3 border rounded-xl p-5">
        <h2 className="font-semibold">Exhibitor Tier *</h2>
        <p className="text-xs text-slate-500">Select the tier you paid for. Staff quotas are enforced by tier.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {EXHIBITOR_TIERS.map(t => (
            <label key={t.id}
              className={`border rounded-lg p-3 cursor-pointer hover:border-indigo-400 ${tierId === t.id ? 'border-indigo-600 bg-indigo-50' : ''}`}>
              <input type="radio" name="tier" checked={tierId === t.id}
                onChange={() => setTierId(t.id)} className="mr-2" />
              <span className="font-semibold">{t.name}</span>
              <div className="text-xs text-slate-500 mt-1">
                {t.boothSize !== '—' && <>Booth: <strong>{t.boothSize}</strong> · </>}
                {t.hallOnlyQuota} Hall-Only + {t.fullCongressQuota} Full Congress staff
              </div>
            </label>
          ))}
        </div>
      </section>

      {/* Section 3: Additional m² */}
      {tier && (
        <section className="space-y-3 border rounded-xl p-5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={wantsAdditionalSqm}
              onChange={e => setWantsAdditionalSqm(e.target.checked)} />
            Do you want additional booth space? (paid separately)
          </label>
          {wantsAdditionalSqm && (
            <label className="block">
              <span className="text-sm font-medium">Additional m²</span>
              <input type="number" min={1} value={additionalSqm ?? ''}
                onChange={e => setAdditionalSqm(e.target.value ? Number(e.target.value) : null)}
                className="mt-1 w-40 border rounded-lg px-3 py-2" />
            </label>
          )}
        </section>
      )}

      {/* Section 4: Staff roster */}
      {tier && (
        <section className="space-y-4 border rounded-xl p-5">
          <h2 className="font-semibold">Staff Roster</h2>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Exhibit Hall Only staff</h3>
              <span className="text-xs text-slate-500">{hallOnlyStaff.length} of {tier.hallOnlyQuota} slots used</span>
            </div>
            {hallOnlyStaff.map(s => (
              <ExhibitorStaffRow key={s.id} name={s.name} email={s.email}
                onChange={patch => updateStaff(s.id, patch)} onRemove={() => removeStaff(s.id)} />
            ))}
            <button type="button"
              disabled={hallOnlyStaff.length >= tier.hallOnlyQuota}
              onClick={() => addStaff('hall_only')}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 disabled:text-slate-400">
              <Plus className="w-4 h-4" /> Add Hall-Only staff member
            </button>
          </div>

          <div className="space-y-2 pt-2 border-t">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">Full Congress staff</h3>
              <span className="text-xs text-slate-500">{fullCongressStaff.length} of {tier.fullCongressQuota} slots used</span>
            </div>
            {fullCongressStaff.map(s => (
              <ExhibitorStaffRow key={s.id} name={s.name} email={s.email}
                onChange={patch => updateStaff(s.id, patch)} onRemove={() => removeStaff(s.id)} />
            ))}
            <button type="button"
              disabled={fullCongressStaff.length >= tier.fullCongressQuota}
              onClick={() => addStaff('full_congress')}
              className="inline-flex items-center gap-1 text-sm text-indigo-600 disabled:text-slate-400">
              <Plus className="w-4 h-4" /> Add Full Congress staff member
            </button>
          </div>
        </section>
      )}

      {/* Section 5: Consents */}
      <section className="space-y-3 border rounded-xl p-5">
        <h2 className="font-semibold">Consents</h2>
        <ConsentCheckbox
          id="consent-terms"
          label="I have read and agree to the"
          linkText="Terms & Conditions"
          modalTitle="GANSID Congress 2026 — Terms & Conditions"
          modalUrl="/branding/gansid/docs/gc26-terms-conditions.md"
          checked={consentTerms}
          onChange={setConsentTerms}
          required
        />
        <ConsentCheckbox
          id="consent-disclaimer"
          label="I have read and agree to the"
          linkText="Disclaimer & Liability Waiver"
          modalTitle="GANSID Congress 2026 — Disclaimer & Limitation of Liability"
          modalUrl="/branding/gansid/docs/gc26-disclaimer.md"
          checked={consentDisclaimer}
          onChange={setConsentDisclaimer}
          required
        />
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5" checked={consentPhoto}
            onChange={e => setConsentPhoto(e.target.checked)} required />
          I acknowledge that photos or videos may be taken at the event for GANSID promotional purposes. *
        </label>
      </section>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-900">
          {error}
        </div>
      )}

      <button type="submit"
        disabled={!canSubmit || submitting}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-500 disabled:bg-slate-300">
        {submitting ? 'Submitting…' : 'Register Organization'}
      </button>
    </form>
  );
}
