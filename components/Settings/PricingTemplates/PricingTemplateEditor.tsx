import React, { useState } from 'react';
import { ArrowLeft, Save } from 'lucide-react';
import {
  createPricingTemplate,
  updatePricingTemplate,
} from '../../../services/storageService';
import type { PricingTemplate } from '../../../types';
import BasicsSection from './sections/BasicsSection';
import TiersSection from './sections/TiersSection';
import DateBracketsSection from './sections/DateBracketsSection';
import PricingMatrixSection from './sections/PricingMatrixSection';
import AddonsSection from './sections/AddonsSection';

interface Props {
  template: PricingTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}

const EMPTY: Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  currency: 'USD',
  isActive: true,
  tiers: [
    { id: 'tier1', name: 'Tier 1', label: '', countries: [] },
    { id: 'tier2', name: 'Tier 2', label: '', countries: [] },
  ],
  dateBrackets: [],
  activeBracketOverride: null,
  categories: [],
  addons: [],
};

export default function PricingTemplateEditor({ template, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Omit<PricingTemplate, 'id' | 'createdAt' | 'updatedAt'>>(
    template
      ? {
          name: template.name, timezone: template.timezone, currency: template.currency,
          isActive: template.isActive, tiers: template.tiers, dateBrackets: template.dateBrackets,
          activeBracketOverride: template.activeBracketOverride,
          categories: template.categories, addons: template.addons,
        }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (template) await updatePricingTemplate(template.id, draft);
      else await createPricingTemplate(draft);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button onClick={onClose} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </button>
        <button
          onClick={save}
          disabled={saving || !draft.name.trim()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-slate-300"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving\u2026' : 'Save template'}
        </button>
      </div>

      <BasicsSection draft={draft} onChange={setDraft} />
      <TiersSection draft={draft} onChange={setDraft} />
      <DateBracketsSection draft={draft} onChange={setDraft} />
      <PricingMatrixSection draft={draft} onChange={setDraft} />
      <AddonsSection draft={draft} onChange={setDraft} />
    </div>
  );
}
