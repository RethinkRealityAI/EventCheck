import React, { useEffect, useState } from 'react';
import type { Form, PricingTemplate, AppSettings, PromoCode, PricingCategory } from '../../types';
import { getPricingTemplates, getSettings } from '../../services/storageService';
import { resolveBracket } from '../../utils/pricing';
import { CURRENT_SITE } from '../../config/sites';
import PromoCodesEditor from './PromoCodesEditor';

interface Props {
  form: Form;
  onFormChange: (next: Form) => void;
}

export default function PricingTab({ form, onFormChange }: Props) {
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const selectedId = (form.settings as any)?.pricingTemplateId ?? '';
  const hasLinkedPricingTemplate = !!selectedId;

  useEffect(() => {
    getSettings().then(s => {
      setAppSettings(s);
      if (s.feature_pricing_templates || hasLinkedPricingTemplate) {
        getPricingTemplates().then(setTemplates);
      }
    });
  }, [hasLinkedPricingTemplate]);

  if (!appSettings) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!appSettings.feature_pricing_templates && !hasLinkedPricingTemplate) {
    return <p className="text-sm text-slate-500">Enable "Pricing Templates" in Settings → General to use dynamic pricing.</p>;
  }

  const selected = templates.find(t => t.id === selectedId);
  const enabled = !!selectedId;

  const setTemplate = (id: string | null) => {
    // When dynamic pricing is turned off, BOGO must also be cleared since
    // the price-ceiling rule depends on category prices from the template.
    const next: any = { ...(form.settings ?? {}), pricingTemplateId: id };
    if (!id) {
      next.bogoEnabled = false;
    }
    onFormChange({ ...form, settings: next });
  };

  // BOGO is event-form only and portal-tenant only. SCAGO (portalEnabled
  // = false) doesn't have the portal "My Tickets" surface that powers
  // post-purchase sends/edits, so the toggle is hidden there.
  const bogoSupported =
    (CURRENT_SITE.portalEnabled ?? false) &&
    (form.formType ?? 'event') === 'event';
  const bogoEnabled = (form.settings as any)?.bogoEnabled === true;
  const bogoNote = (form.settings as any)?.bogoNoteToBuyer ?? '';

  const setBogoEnabled = (on: boolean) => {
    onFormChange({
      ...form,
      settings: { ...(form.settings ?? {}), bogoEnabled: on } as any,
    });
  };
  const setBogoNote = (s: string) => {
    onFormChange({
      ...form,
      settings: { ...(form.settings ?? {}), bogoNoteToBuyer: s } as any,
    });
  };

  // ── Promo codes (form-level, for dynamic-pricing forms) ─────────────
  const promoCodes: PromoCode[] = ((form.settings as any)?.promoCodes ?? []) as PromoCode[];
  const setPromoCodes = (next: PromoCode[]) => {
    onFormChange({
      ...form,
      settings: { ...(form.settings ?? {}), promoCodes: next } as any,
    });
  };

  const templateCategories: Pick<PricingCategory, 'id' | 'name'>[] = selected?.categories ?? [];

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox" checked={enabled}
          onChange={e => setTemplate(e.target.checked ? templates[0]?.id ?? null : null)}
        />
        <span className="text-sm">Use dynamic pricing</span>
      </label>

      {enabled && (
        <>
          <label className="block">
            <span className="text-sm text-slate-600">Pricing template</span>
            <select
              className="mt-1 w-full border rounded px-3 py-2"
              value={selectedId}
              onChange={e => setTemplate(e.target.value)}
            >
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>

          {selected && (
            <div className="text-sm text-slate-600 border rounded-lg p-3 bg-slate-50">
              <div>Currency: <strong>{selected.currency}</strong></div>
              <div>Tiers: {selected.tiers.length} · Categories: {selected.categories.length} · Add-ons: {selected.addons.length}</div>
              <div>Active bracket: <strong>{resolveBracket(selected, new Date())?.name ?? '(none)'}</strong></div>
            </div>
          )}

          {/* Promo codes — applies to dynamic-pricing forms only. The
              legacy ticketConfig.promoCodes are still honored on static-
              ticket forms via the static-ticket branch of verify-payment. */}
          <div className="border-t pt-4 mt-4">
            <PromoCodesEditor
              promoCodes={promoCodes}
              onChange={setPromoCodes}
              templateCategories={templateCategories}
            />
          </div>

          {bogoSupported && (
            <div className="border-t pt-4 mt-4">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={bogoEnabled}
                  onChange={e => setBogoEnabled(e.target.checked)}
                  className="mt-1"
                />
                <span className="text-sm">
                  <span className="font-medium text-slate-800">
                    Enable Buy-One-Get-One-Free
                  </span>
                  <span className="block text-slate-600 mt-0.5">
                    Each paid attendee on this form can bring one guest free,
                    with a ticket category of equal or lesser value than their
                    own (compared at their tier &amp; bracket).
                  </span>
                </span>
              </label>

              {bogoEnabled && (
                <label className="block mt-3">
                  <span className="text-xs text-slate-600">
                    Message to buyer (optional — shown in the BOGO section at checkout)
                  </span>
                  <textarea
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    rows={2}
                    value={bogoNote}
                    placeholder="Bring a colleague — equal or lesser ticket value free."
                    onChange={e => setBogoNote(e.target.value)}
                  />
                </label>
              )}
            </div>
          )}
        </>
      )}

      {bogoSupported && !enabled && (form.settings as any)?.bogoEnabled && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
          BOGO was enabled but the pricing template was removed. Re-enable dynamic
          pricing to keep BOGO active — otherwise it will be ignored at runtime.
        </div>
      )}
    </div>
  );
}
