import React from 'react';
import type { PromoCode, PricingCategory } from '../../types';
import { DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE, promoUsageLimitCategories } from '../../utils/promoCodes';

interface Props {
  promoCodes: PromoCode[];
  onChange: (next: PromoCode[]) => void;
  templateCategories: Pick<PricingCategory, 'id' | 'name'>[];
  /** Compact layout for the field properties sidebar. */
  compact?: boolean;
}

export default function PromoCodesEditor({
  promoCodes,
  onChange,
  templateCategories,
  compact = false,
}: Props) {
  const addPromoCode = () => {
    onChange([...promoCodes, { code: '', type: 'percent', value: 100, enabled: true }]);
  };
  const updatePromoCode = (i: number, patch: Partial<PromoCode>) => {
    onChange(promoCodes.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };
  const removePromoCode = (i: number) => {
    onChange(promoCodes.filter((_, idx) => idx !== i));
  };

  const setPromoCategoryScope = (i: number, global: boolean) => {
    if (global) {
      updatePromoCode(i, { allowedCategoryIds: undefined });
      return;
    }
    const firstId = templateCategories[0]?.id;
    updatePromoCode(i, { allowedCategoryIds: firstId ? [firstId] : [] });
  };

  const togglePromoCategory = (i: number, categoryId: string, checked: boolean) => {
    const p = promoCodes[i];
    const current = p.allowedCategoryIds ?? [];
    const next = checked ? [...current, categoryId] : current.filter(id => id !== categoryId);
    updatePromoCode(i, { allowedCategoryIds: next.length > 0 ? next : [] });
  };

  const setPromoUsageLimit = (i: number, categoryId: string, raw: string) => {
    const p = promoCodes[i];
    const n = Number(raw);
    const next = { ...(p.usageLimits ?? {}) };
    if (!raw.trim() || !Number.isFinite(n) || n <= 0) {
      delete next[categoryId];
    } else {
      next[categoryId] = Math.floor(n);
    }
    updatePromoCode(i, {
      usageLimits: Object.keys(next).length > 0 ? next : undefined,
    });
  };

  const inputCls = compact
    ? 'fb-input-sm w-full'
    : 'px-2 py-1.5 text-sm border border-slate-300 rounded w-full';
  const selectCls = compact
    ? 'fb-input-sm w-full'
    : 'px-2 py-1.5 text-sm border border-slate-300 rounded w-full';
  const cardCls = compact
    ? 'rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2'
    : 'rounded border border-slate-200 bg-slate-50 p-3 space-y-2';

  return (
    <div className="space-y-2">
      {!compact && (
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Promo codes</h3>
            <p className="text-xs text-slate-600">
              100% off codes for free registrations (e.g. speaker codes). Case-insensitive at checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={addPromoCode}
            className="text-xs px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50"
          >
            + Add code
          </button>
        </div>
      )}

      {promoCodes.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No promo codes configured.</p>
      ) : (
        <div className="space-y-2">
          {promoCodes.map((p, i) => (
            <div key={i} className={cardCls}>
              <div className={compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-[1fr_auto_auto_auto] gap-2'}>
                <div className={compact ? 'fb-field-group' : undefined}>
                  {compact && <label className="fb-label-tiny">Code</label>}
                  <input
                    type="text"
                    placeholder="CODE (e.g. SPEAKER2026)"
                    value={p.code}
                    onChange={e => updatePromoCode(i, { code: e.target.value.toUpperCase() })}
                    className={`${inputCls} ${!compact ? 'font-mono' : ''}`}
                  />
                </div>
                <div className={compact ? 'grid grid-cols-2 gap-2' : 'contents'}>
                  <div className={compact ? 'fb-field-group' : undefined}>
                    {compact && <label className="fb-label-tiny">Type</label>}
                    <select
                      value={p.type}
                      onChange={e => updatePromoCode(i, { type: e.target.value as 'percent' | 'fixed' })}
                      className={selectCls}
                    >
                      <option value="percent">% off</option>
                      <option value="fixed">fixed (cents)</option>
                    </select>
                  </div>
                  <div className={compact ? 'fb-field-group' : undefined}>
                    {compact && <label className="fb-label-tiny">Value</label>}
                    <input
                      type="number"
                      min={0}
                      value={p.value}
                      onChange={e => updatePromoCode(i, { value: Number(e.target.value) || 0 })}
                      className={inputCls}
                    />
                  </div>
                </div>
                {!compact && (
                  <button
                    type="button"
                    onClick={() => removePromoCode(i)}
                    className="text-xs px-2 py-1.5 text-rose-600 hover:bg-rose-50 rounded"
                  >
                    Remove
                  </button>
                )}
                {compact && (
                  <button
                    type="button"
                    onClick={() => removePromoCode(i)}
                    className="fb-promo-delete self-end"
                    title="Remove code"
                  >
                    ×
                  </button>
                )}
              </div>

              <div className={compact ? 'fb-field-group' : undefined}>
                {compact && <label className="fb-label-tiny">Applies to</label>}
                <select
                  value={p.appliesTo || 'all'}
                  onChange={e => updatePromoCode(i, { appliesTo: e.target.value as 'all' | 'registration_only' })}
                  className={selectCls}
                >
                  <option value="all">Overall pricing (tickets + add-ons)</option>
                  <option value="registration_only">Registration fee only (excludes add-ons)</option>
                </select>
              </div>

              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={p.enabled !== false}
                    onChange={e => updatePromoCode(i, { enabled: e.target.checked })}
                  />
                  <span>Enabled</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={p.appliesGuestType === 'speaker'}
                    onChange={e => {
                      const speaker = e.target.checked;
                      updatePromoCode(i, {
                        appliesGuestType: speaker ? 'speaker' : undefined,
                        appliedMessage: speaker && !p.appliedMessage
                          ? DEFAULT_SPEAKER_PROMO_APPLIED_MESSAGE
                          : p.appliedMessage,
                      });
                    }}
                  />
                  <span>Tag registrant as Speaker</span>
                </label>
              </div>

              <div className={compact ? 'fb-field-group' : undefined}>
                {compact && <label className="fb-label-tiny">Message after Apply</label>}
                <input
                  type="text"
                  placeholder="Message after Apply (e.g. Speaker Registration Discount Applied)"
                  value={p.appliedMessage ?? ''}
                  onChange={e => updatePromoCode(i, { appliedMessage: e.target.value })}
                  className={inputCls}
                />
              </div>

              {!compact && (
                <input
                  type="text"
                  placeholder="Internal description (admin-only, optional)"
                  value={p.description ?? ''}
                  onChange={e => updatePromoCode(i, { description: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded text-slate-600"
                />
              )}

              {templateCategories.length > 0 && (
                <div className="border-t border-gray-200 pt-2 space-y-2">
                  <div className="text-xs font-medium text-gray-700">Registration category scope</div>
                  <div className="flex flex-wrap gap-3 text-xs">
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`promo-scope-${i}`}
                        checked={p.allowedCategoryIds === undefined}
                        onChange={() => setPromoCategoryScope(i, true)}
                      />
                      <span>All categories</span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="radio"
                        name={`promo-scope-${i}`}
                        checked={p.allowedCategoryIds !== undefined}
                        onChange={() => setPromoCategoryScope(i, false)}
                      />
                      <span>Specific categories only</span>
                    </label>
                  </div>
                  {p.allowedCategoryIds !== undefined && (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {templateCategories.map(cat => (
                          <label
                            key={cat.id}
                            className="flex items-center gap-1 text-xs bg-white border border-gray-200 rounded px-2 py-1"
                          >
                            <input
                              type="checkbox"
                              checked={p.allowedCategoryIds!.includes(cat.id)}
                              onChange={e => togglePromoCategory(i, cat.id, e.target.checked)}
                            />
                            <span>{cat.name}</span>
                          </label>
                        ))}
                      </div>
                      {p.allowedCategoryIds.length === 0 && (
                        <p className="text-xs text-amber-700">Select at least one category.</p>
                      )}
                    </>
                  )}
                </div>
              )}

              {templateCategories.length > 0 && (
                <div className="border-t border-gray-200 pt-2 space-y-2">
                  <div className="text-xs font-medium text-gray-700">Usage limits (optional)</div>
                  <p className="text-xs text-gray-500">
                    Max redemptions per category. Blank = unlimited.
                  </p>
                  <div className="space-y-1">
                    {promoUsageLimitCategories(p, templateCategories).map(cat => (
                      <label key={cat.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-700 truncate">{cat.name}</span>
                        <input
                          type="number"
                          min={1}
                          placeholder="∞"
                          value={p.usageLimits?.[cat.id] ?? ''}
                          onChange={e => setPromoUsageLimit(i, cat.id, e.target.value)}
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-right fb-input-sm"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {templateCategories.length === 0 && (
                <p className="text-xs text-amber-700">
                  Select a pricing template on the Pricing tab to configure category scope and usage limits.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {compact && (
        <button type="button" onClick={addPromoCode} className="fb-add-button">
          + Add Promo Code
        </button>
      )}
    </div>
  );
}
