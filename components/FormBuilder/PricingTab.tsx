import React, { useEffect, useState } from 'react';
import type { Form, PricingTemplate, AppSettings } from '../../types';
import { getPricingTemplates, getSettings } from '../../services/storageService';
import { resolveBracket } from '../../utils/pricing';

interface Props {
  form: Form;
  onFormChange: (next: Form) => void;
}

export default function PricingTab({ form, onFormChange }: Props) {
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);

  useEffect(() => {
    getSettings().then(s => {
      setAppSettings(s);
      if (s.feature_pricing_templates) getPricingTemplates().then(setTemplates);
    });
  }, []);

  if (!appSettings) return <p className="text-sm text-slate-500">Loading…</p>;

  if (!appSettings.feature_pricing_templates) {
    return <p className="text-sm text-slate-500">Enable "Pricing Templates" in Settings → General to use dynamic pricing.</p>;
  }

  const selectedId = (form.settings as any)?.pricingTemplateId ?? '';
  const selected = templates.find(t => t.id === selectedId);
  const enabled = !!selectedId;

  const setTemplate = (id: string | null) => {
    onFormChange({
      ...form,
      settings: { ...(form.settings ?? {}), pricingTemplateId: id } as any,
    });
  };

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
        </>
      )}
    </div>
  );
}
