import React from 'react';
import type { FeesPeriod, FeesRow, FeesTier, LandingContent, PricingPromoConfig, PromoColorPreset } from '../../types';
import { LANDING_DEFAULTS } from '../Portal/content/landingDefaults';
import { PlainField } from './fields/PlainField';
import { RepeaterField } from './fields/RepeaterField';
import { ColorField } from './fields/ColorField';

const COLOR_PRESETS: { label: string; value: PromoColorPreset }[] = [
  { label: 'GANSID red', value: 'gansid-red' },
  { label: 'GANSID blue', value: 'gansid-blue' },
  { label: 'Save green', value: 'save-green' },
  { label: 'Amber', value: 'amber' },
  { label: 'Custom', value: 'custom' },
];

export function PricingFeesEditor({
  draft,
  onChange,
}: {
  draft: LandingContent;
  onChange: (d: LandingContent) => void;
}) {
  const patchFees = (fees: LandingContent['fees']) => onChange({ ...draft, fees });
  const patchPromo = (p: Partial<PricingPromoConfig>) =>
    onChange({ ...draft, pricingPromo: { ...draft.pricingPromo, ...p } });

  const allCategories = Array.from(
    new Set(draft.fees.tiers.flatMap((t) => t.rows.map((r) => r.category))),
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Conference fees table</h3>
            <p className="text-sm text-slate-500">CMS-authored pricing shown on the landing page.</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...draft, fees: LANDING_DEFAULTS.fees })}
            className="text-sm text-slate-500 hover:text-indigo-600 underline"
          >
            Reset fees to default
          </button>
        </div>

        <PlainField
          label="Fees note"
          value={draft.fees.note}
          onChange={(note) => patchFees({ ...draft.fees, note })}
        />

        <RepeaterField<FeesPeriod>
          label="Pricing periods (columns)"
          items={draft.fees.periods}
          onChange={(periods) => patchFees({ ...draft.fees, periods })}
          newItem={() => ({ id: `period-${crypto.randomUUID().slice(0, 8)}`, label: 'New period', subtitle: '' })}
          renderItem={(period, patch) => (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PlainField label="ID" value={period.id} onChange={(id) => patch({ id })} />
              <PlainField label="Label" value={period.label} onChange={(label) => patch({ label })} />
              <PlainField label="Subtitle" value={period.subtitle} onChange={(subtitle) => patch({ subtitle })} />
            </div>
          )}
        />

        <RepeaterField<FeesTier>
          label="Tiers"
          items={draft.fees.tiers}
          onChange={(tiers) => patchFees({ ...draft.fees, tiers })}
          newItem={() => ({
            id: `tier-${crypto.randomUUID().slice(0, 8)}`,
            label: 'New tier',
            subtitle: '',
            rows: [],
          })}
          renderItem={(tier, patchTier) => (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <PlainField label="Tier label" value={tier.label} onChange={(label) => patchTier({ label })} />
                <PlainField label="Tier subtitle" value={tier.subtitle} onChange={(subtitle) => patchTier({ subtitle })} />
              </div>
              <RepeaterField<FeesRow>
                label="Category rows"
                items={tier.rows}
                onChange={(rows) => patchTier({ rows })}
                newItem={() => {
                  const row: FeesRow = { category: 'New category' };
                  draft.fees.periods.forEach((p) => { row[p.id] = 0; });
                  return row;
                }}
                renderItem={(row, patchRow) => (
                  <div className="space-y-2">
                    <PlainField label="Category" value={row.category} onChange={(category) => patchRow({ category })} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {draft.fees.periods.map((p) => (
                        <label key={p.id} className="block">
                          <span className="text-xs text-slate-500">{p.label}</span>
                          <input
                            type="number"
                            min={0}
                            value={Number(row[p.id] ?? 0)}
                            onChange={(e) => patchRow({ [p.id]: Number(e.target.value) })}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              />
            </div>
          )}
        />
      </section>

      <section className="space-y-4 border-t border-slate-200 pt-8">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Early-bird promo pill</h3>
            <p className="text-sm text-slate-500">Strikethrough + badge on landing fees and checkout.</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...draft, pricingPromo: LANDING_DEFAULTS.pricingPromo })}
            className="text-sm text-slate-500 hover:text-indigo-600 underline"
          >
            Reset promo to default
          </button>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={draft.pricingPromo.enabled}
            onChange={(e) => patchPromo({ enabled: e.target.checked })}
          />
          <span className="text-sm font-medium text-slate-700">Enabled</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PlainField label="Badge label" value={draft.pricingPromo.label} onChange={(label) => patchPromo({ label })} />
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Color preset</span>
            <select
              value={draft.pricingPromo.colorPreset}
              onChange={(e) => patchPromo({ colorPreset: e.target.value as PromoColorPreset })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {COLOR_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        {draft.pricingPromo.colorPreset === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Custom background" value={draft.pricingPromo.customBg ?? '#059669'} onChange={(customBg) => patchPromo({ customBg })} />
            <ColorField label="Custom text" value={draft.pricingPromo.customText ?? '#ffffff'} onChange={(customText) => patchPromo({ customText })} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Promo period (new price)</span>
            <select
              value={draft.pricingPromo.promoPeriodId}
              onChange={(e) => patchPromo({ promoPeriodId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {draft.fees.periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 mb-1">Compare period (old price)</span>
            <select
              value={draft.pricingPromo.comparePeriodId}
              onChange={(e) => patchPromo({ comparePeriodId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {draft.fees.periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700 mb-1">Category targeting</span>
          <select
            value={draft.pricingPromo.categories === 'all' ? 'all' : 'list'}
            onChange={(e) => {
              if (e.target.value === 'all') patchPromo({ categories: 'all' });
              else patchPromo({ categories: allCategories.slice(0, 1) });
            }}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-2"
          >
            <option value="all">All categories</option>
            <option value="list">Selected categories only</option>
          </select>
          {draft.pricingPromo.categories !== 'all' && (
            <div className="space-y-1 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-3">
              {allCategories.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.pricingPromo.categories.includes(cat)}
                    onChange={(e) => {
                      const current = draft.pricingPromo.categories === 'all'
                        ? []
                        : [...draft.pricingPromo.categories];
                      const next = e.target.checked
                        ? [...current, cat]
                        : current.filter((c) => c !== cat);
                      patchPromo({ categories: next.length ? next : [cat] });
                    }}
                  />
                  {cat}
                </label>
              ))}
            </div>
          )}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PlainField
            label="End date (YYYY-MM-DD, optional)"
            value={draft.pricingPromo.endDate ?? ''}
            onChange={(endDate) => patchPromo({ endDate: endDate || null })}
          />
          <label className="flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={draft.pricingPromo.showCountdown ?? false}
              onChange={(e) => patchPromo({ showCountdown: e.target.checked })}
            />
            Show countdown caption
          </label>
        </div>
      </section>
    </div>
  );
}
