import React, { useEffect, useState } from 'react';
import { Plus, Copy, Archive, Pencil } from 'lucide-react';
import {
  getPricingTemplates,
  archivePricingTemplate,
  duplicatePricingTemplate,
} from '../../../services/storageService';
import type { PricingTemplate } from '../../../types';
import PricingTemplateEditor from './PricingTemplateEditor';

export default function PricingTemplatesTab() {
  const [templates, setTemplates] = useState<PricingTemplate[]>([]);
  const [editing, setEditing] = useState<PricingTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      setTemplates(await getPricingTemplates());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (creating || editing) {
    return (
      <PricingTemplateEditor
        template={editing}
        onClose={() => { setEditing(null); setCreating(false); }}
        onSaved={async () => { await refresh(); setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Pricing Templates</h2>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-500"
        >
          <Plus className="w-4 h-4" /> New Template
        </button>
      </div>

      {loading && <div className="text-slate-400">Loading…</div>}

      {!loading && templates.length === 0 && (
        <div className="p-8 text-center border border-dashed rounded-xl text-slate-500">
          No pricing templates yet. Create one to enable dynamic pricing on a form.
        </div>
      )}

      <div className="divide-y border rounded-xl">
        {templates.map(t => (
          <div key={t.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{t.name}</div>
              <div className="text-xs text-slate-500">
                {t.currency} · {t.tiers.length} tiers · {t.categories.length} categories · {t.addons.length} add-ons
                {t.activeBracketOverride ? ' · override active' : ''}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setEditing(t)} className="p-2 hover:bg-slate-100 rounded-md" title="Edit">
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  const name = window.prompt('Name for the copy?', `${t.name} (copy)`);
                  if (name) { await duplicatePricingTemplate(t.id, name); await refresh(); }
                }}
                className="p-2 hover:bg-slate-100 rounded-md"
                title="Duplicate"
              >
                <Copy className="w-4 h-4" />
              </button>
              <button
                onClick={async () => {
                  if (window.confirm(`Archive "${t.name}"?`)) { await archivePricingTemplate(t.id); await refresh(); }
                }}
                className="p-2 hover:bg-slate-100 rounded-md"
                title="Archive"
              >
                <Archive className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
