import React from 'react';
import type { FeesPeriod, FeesRow, FeesTier, LandingContent, PricingPromoConfig } from '../../types';
import { LANDING_DEFAULTS } from '../Portal/content/landingDefaults';
import { isPromoActive } from '../../utils/pricingPromo';
import { PromoPrice } from '../Pricing/PromoPrice';
import { PlainField } from './fields/PlainField';
import { RepeaterField } from './fields/RepeaterField';
import { ColorField } from './fields/ColorField';
import {
  CmsButton,
  CmsPageHeader,
  CmsToggle,
  PromoColorPresets,
  SectionCard,
} from './cmsUi';

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

  const previewRow = draft.fees.tiers[0]?.rows[0];
  const promoPeriod = draft.fees.periods.find((p) => p.id === draft.pricingPromo.promoPeriodId);
  const comparePeriod = draft.fees.periods.find((p) => p.id === draft.pricingPromo.comparePeriodId);
  const previewOld = previewRow && comparePeriod ? Number(previewRow[comparePeriod.id] ?? 0) : undefined;
  const previewNew = previewRow && promoPeriod ? Number(previewRow[promoPeriod.id] ?? 0) : undefined;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Conference fees table"
        description="Shown on the landing page — independent from the pricing engine"
        accent="blue"
        defaultOpen
        onReset={() => onChange({ ...draft, fees: LANDING_DEFAULTS.fees })}
      >
        <PlainField label="Table note" value={draft.fees.note} onChange={(note) => patchFees({ ...draft.fees, note })} />

        <RepeaterField<FeesPeriod>
          label="Pricing periods (columns)"
          items={draft.fees.periods}
          onChange={(periods) => patchFees({ ...draft.fees, periods })}
          newItem={() => ({ id: `period-${crypto.randomUUID().slice(0, 8)}`, label: 'New period', subtitle: '' })}
          renderItem={(period, patch) => (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <PlainField label="ID (stable key)" value={period.id} onChange={(id) => patch({ id })} />
              <PlainField label="Column label" value={period.label} onChange={(label) => patch({ label })} />
              <PlainField label="Subtitle" value={period.subtitle} onChange={(subtitle) => patch({ subtitle })} />
            </div>
          )}
        />

        <RepeaterField<FeesTier>
          label="Country tiers"
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
                  <div className="space-y-3 rounded-xl bg-white p-3 ring-1 ring-slate-200/80">
                    <PlainField label="Category name" value={row.category} onChange={(category) => patchRow({ category })} />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {draft.fees.periods.map((p) => (
                        <label key={p.id} className="block">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{p.label}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={Number(row[p.id] ?? 0)}
                            onChange={(e) => patchRow({ [p.id]: Number(e.target.value) })}
                            className="mt-1 w-full px-2.5 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2260a1]/25"
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
      </SectionCard>

      <SectionCard
        title="Early-bird promo pill"
        description="Strikethrough + badge on the fees table and checkout category selector"
        accent="red"
        onReset={() => onChange({ ...draft, pricingPromo: LANDING_DEFAULTS.pricingPromo })}
      >
        <CmsToggle
          checked={draft.pricingPromo.enabled}
          onChange={(enabled) => patchPromo({ enabled })}
          label="Show early-bird promo"
          description="When off, prices display normally with no badge"
        />

        <PlainField label="Badge label" value={draft.pricingPromo.label} onChange={(label) => patchPromo({ label })} />

        <PromoColorPresets
          value={draft.pricingPromo.colorPreset}
          onChange={(colorPreset) => patchPromo({ colorPreset })}
        />

        {draft.pricingPromo.colorPreset === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <ColorField label="Badge background" value={draft.pricingPromo.customBg ?? '#059669'} onChange={(customBg) => patchPromo({ customBg })} />
            <ColorField label="Badge text" value={draft.pricingPromo.customText ?? '#ffffff'} onChange={(customText) => patchPromo({ customText })} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Promo period (new price)</span>
            <select
              value={draft.pricingPromo.promoPeriodId}
              onChange={(e) => patchPromo({ promoPeriodId: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2260a1]/25"
            >
              {draft.fees.periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">Compare period (struck-through)</span>
            <select
              value={draft.pricingPromo.comparePeriodId}
              onChange={(e) => patchPromo({ comparePeriodId: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2260a1]/25"
            >
              {draft.fees.periods.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Category targeting</span>
          <p className="text-xs text-slate-500 mb-2">
            Names must match pricing-template category names exactly (case-sensitive) for the checkout pill.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            <CmsButton
              variant={draft.pricingPromo.categories === 'all' ? 'primary' : 'secondary'}
              className="!py-2 !px-3 text-xs"
              onClick={() => patchPromo({ categories: 'all' })}
            >
              All categories
            </CmsButton>
            <CmsButton
              variant={draft.pricingPromo.categories !== 'all' ? 'primary' : 'secondary'}
              className="!py-2 !px-3 text-xs"
              onClick={() => patchPromo({ categories: allCategories.slice(0, 1) })}
            >
              Selected only
            </CmsButton>
          </div>
          {draft.pricingPromo.categories !== 'all' && (
            <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-200 p-3 space-y-1.5 bg-slate-50/50">
              {allCategories.map((cat) => (
                <label key={cat} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-white rounded-lg px-2 py-1">
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
                    className="rounded border-slate-300 text-[#2260a1]"
                  />
                  {cat}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
          <PlainField
            label="End date (optional)"
            type="date"
            value={draft.pricingPromo.endDate ?? ''}
            onChange={(endDate) => patchPromo({ endDate: endDate || null })}
          />
          <CmsToggle
            checked={draft.pricingPromo.showCountdown ?? false}
            onChange={(showCountdown) => patchPromo({ showCountdown })}
            label="Show “ends {date}” caption"
          />
        </div>

        {draft.pricingPromo.enabled && previewRow && (
          <div className="rounded-2xl bg-slate-50 ring-1 ring-slate-200/80 p-5">
            <CmsPageHeader
              title="Live preview"
              description={`Sample: ${previewRow.category} · ${promoPeriod?.label ?? 'promo'} column`}
            />
            <div className="flex justify-center py-4">
              {isPromoActive(draft.pricingPromo, new Date()) && typeof previewNew === 'number' ? (
                <PromoPrice
                  oldPrice={previewOld}
                  newPrice={previewNew}
                  config={draft.pricingPromo}
                />
              ) : (
                <p className="text-sm text-slate-500">Promo inactive or missing prices — check end date and enabled toggle.</p>
              )}
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
