import React from 'react';
import type { Form, FormField } from '../../types';
import type { PricingTemplate } from '../../types';
import CountryField from '../FormBuilder/fields/CountryField';
import { getCountryName } from '../../utils/countries';
import GroupPersonRow from '../Group/GroupPersonRow';
import GroupShortcutsToggle from '../Group/GroupShortcutsToggle';
import ConsentCheckbox from '../Consent/ConsentCheckbox';
import PricingBracketBanner from '../Pricing/PricingBracketBanner';
import LivePriceCategory from '../Pricing/LivePriceCategory';
import AddonsList from '../Pricing/AddonsList';
import RunningTotal from '../Pricing/RunningTotal';
import { formatPrice } from '../../utils/pricing';
import { Check, Tag, Info, AlertCircle, MapPin } from 'lucide-react';

const EXHIBITOR_STAFF_HIDDEN_FIELD_IDS = new Set([
  'f_present',
  'f_emerg_name',
  'f_emerg_phone',
  'f_emerg_rel',
]);

export interface FormRendererProps {
  form: Form;
  filteredFields: FormField[];
  mode: 'purchaser' | 'guest';
  isVisible: (f: FormField) => boolean;

  // Pending-claim flags
  isAnyPendingClaim: boolean;
  isPendingClaim: boolean;
  isExhibitorStaffPending: boolean;

  // RMS / group state
  rmsField: FormField | null;
  registrationMode: 'individual' | 'group' | null;
  setRegistrationMode: (m: 'individual' | 'group' | null) => void;
  groupMembers: Array<{
    name: string;
    email: string;
    countryCode: string;
    categoryId: string | null;
    addonIds: string[];
    fullAnswers?: Record<string, any>;
  }>;
  setGroupMembers: React.Dispatch<React.SetStateAction<Array<{
    name: string;
    email: string;
    countryCode: string;
    categoryId: string | null;
    addonIds: string[];
    fullAnswers?: Record<string, any>;
  }>>>;
  groupSize: number;
  setGroupSize: React.Dispatch<React.SetStateAction<number>>;
  groupHasAllInfo: boolean;
  setGroupHasAllInfo: React.Dispatch<React.SetStateAction<boolean>>;
  groupAllSameCountry: boolean;
  setGroupAllSameCountry: React.Dispatch<React.SetStateAction<boolean>>;
  groupAllSameCategory: boolean;
  setGroupAllSameCategory: React.Dispatch<React.SetStateAction<boolean>>;
  groupTotal: number | null;

  // Answers
  answers: Record<string, any>;
  onFieldChange: (fieldId: string, value: any) => void;

  // Dynamic pricing
  pricingTemplate: PricingTemplate | null;
  selectedCategoryId: string | null;
  setSelectedCategoryId: (id: string | null) => void;
  selectedAddonIds: string[];
  setSelectedAddonIds: React.Dispatch<React.SetStateAction<string[]>>;
  activeTier: any | null;
  activeBracket: any | null;
  dynamicTotal: number | null;

  // Ticket / static pricing state
  ticketQuantities: Record<string, number>;
  onQuantityChange: (itemId: string, qty: number) => void;
  promoCode: string;
  setPromoCode: React.Dispatch<React.SetStateAction<string>>;
  appliedPromo: { code: string; value: number; type: 'percent' | 'fixed' } | null;
  onApplyPromo: () => void;
  paymentTotal: number;

  // Guest details (for multi-seat ticket flow)
  guests: Array<{ name: string; email: string; dietary: string; guestType: 'adult' | 'child' }>;
  setGuests: React.Dispatch<React.SetStateAction<Array<{ name: string; email: string; dietary: string; guestType: 'adult' | 'child' }>>>;
  skipGuestDetails: boolean;
  setSkipGuestDetails: React.Dispatch<React.SetStateAction<boolean>>;
  isFirstGuestPurchaser: boolean;
  setIsFirstGuestPurchaser: React.Dispatch<React.SetStateAction<boolean>>;
  isTableFull: boolean;

  // Donation state
  donateOption: 'no' | 'table' | 'seats';
  setDonateOption: React.Dispatch<React.SetStateAction<'no' | 'table' | 'seats'>>;
  donatedSeats: number;
  setDonatedSeats: React.Dispatch<React.SetStateAction<number>>;
  donatedTables: number;
  setDonatedTables: React.Dispatch<React.SetStateAction<number>>;

  // Pricing country sync
  setSelectedCountryCode: React.Dispatch<React.SetStateAction<string>>;
}

export const FormRenderer: React.FC<FormRendererProps> = ({
  form,
  filteredFields,
  mode,
  isVisible,
  isAnyPendingClaim,
  isPendingClaim,
  isExhibitorStaffPending,
  rmsField,
  registrationMode,
  setRegistrationMode,
  groupMembers,
  setGroupMembers,
  groupSize,
  setGroupSize,
  groupHasAllInfo,
  setGroupHasAllInfo,
  groupAllSameCountry,
  setGroupAllSameCountry,
  groupAllSameCategory,
  setGroupAllSameCategory,
  groupTotal,
  answers,
  onFieldChange,
  pricingTemplate,
  selectedCategoryId,
  setSelectedCategoryId,
  selectedAddonIds,
  setSelectedAddonIds,
  activeTier,
  activeBracket,
  dynamicTotal,
  ticketQuantities,
  onQuantityChange,
  promoCode,
  setPromoCode,
  appliedPromo,
  onApplyPromo,
  paymentTotal,
  guests,
  setGuests,
  skipGuestDetails,
  setSkipGuestDetails,
  isFirstGuestPurchaser,
  setIsFirstGuestPurchaser,
  isTableFull,
  donateOption,
  setDonateOption,
  donatedSeats,
  setDonatedSeats,
  donatedTables,
  setDonatedTables,
  setSelectedCountryCode,
}) => {
  return (
    <>
      {filteredFields.map(field => {
        if (!isVisible(field)) return null;
        if (field.type === 'ticket' && mode === 'guest') return null;
        // Pending-claim guests skip pricing-related UI entirely
        if (isAnyPendingClaim && field.type === 'registration-mode-selector') return null;
        if (isAnyPendingClaim && field.type === 'ticket') return null;
        // Exhibitor staff hide additional fields not relevant to their claim flow
        if (isExhibitorStaffPending && EXHIBITOR_STAFF_HIDDEN_FIELD_IDS.has(field.id)) return null;

        // Registration Mode Selector field — always render so visitor can pick a path
        if (field.type === 'registration-mode-selector') {
          return (
            <div key={field.id} className="sm:col-span-2 space-y-4">
              <label className="block text-xs font-display font-semibold text-gansid-on-surface/70 uppercase tracking-wide mb-1.5">
                {field.label} {field.required && <span className="text-gansid-primary">*</span>}
              </label>
              <div className="flex flex-wrap gap-3">
                <label className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 cursor-pointer transition ${registrationMode === 'individual' ? 'border-gansid-primary bg-gansid-primary-container/10 font-semibold' : 'border-gansid-outline-variant/40 hover:border-gansid-primary/50'}`}>
                  <input type="radio" name={field.id} className="accent-gansid-primary" checked={registrationMode === 'individual'}
                    onChange={() => setRegistrationMode('individual')} />
                  <span className="text-sm text-gansid-on-surface">{(field as any).individualLabel || 'Individual — just me'}</span>
                </label>
                {((field as any).groupEnabled ?? true) && (
                  <label className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 cursor-pointer transition ${registrationMode === 'group' ? 'border-gansid-primary bg-gansid-primary-container/10 font-semibold' : 'border-gansid-outline-variant/40 hover:border-gansid-primary/50'}`}>
                    <input type="radio" name={field.id} className="accent-gansid-primary" checked={registrationMode === 'group'}
                      onChange={() => setRegistrationMode('group')} />
                    <span className="text-sm text-gansid-on-surface">{(field as any).groupLabel || `Register additional people (up to ${(field as any).groupMaxSize ?? 5})`}</span>
                  </label>
                )}
              </div>

              {registrationMode === 'group' && pricingTemplate && (
                <div className="space-y-4 mt-2">
                  <div>
                    <label className="block text-xs font-display font-semibold text-gansid-on-surface/70 uppercase tracking-wide mb-1.5">How many additional people are you registering?</label>
                    <p className="text-sm text-gansid-on-surface/70 font-body mb-3">
                      You'll complete the rest of this form for <strong>yourself</strong>. Register up to {(field as any).groupMaxSize ?? 5} additional people here — they'll each get their own ticket.
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {[1, 2, 3, 4, 5].filter(n => n <= ((field as any).groupMaxSize ?? 5)).map(n => (
                        <button type="button" key={n} onClick={() => setGroupSize(n)}
                          className={`px-4 py-2 rounded-full border-2 text-sm font-display font-semibold transition ${groupSize === n ? 'bg-gansid-primary-gradient text-white border-transparent shadow-md' : 'bg-white border-gansid-outline-variant/40 text-gansid-on-surface hover:border-gansid-primary/50'}`}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gansid-outline-variant/30 bg-gansid-surface-container-lowest p-4 space-y-2">
                    <label className="flex items-start gap-2 text-sm font-body text-gansid-on-surface">
                      <input type="checkbox" className="mt-0.5 accent-gansid-primary" checked={groupHasAllInfo}
                        onChange={e => setGroupHasAllInfo(e.target.checked)} />
                      <span>
                        <strong>Yes</strong> — I have each additional person's details on hand and want to fill their full registration out now.
                      </span>
                    </label>
                    <p className="text-sm text-gansid-on-surface/70 font-body pl-6 leading-relaxed">
                      If checked, each guest row below will expand with all registration questions (dietary, emergency contact, consents, etc.). Each guest still receives their own ticket by email and can optionally create a portal account.
                      <br />
                      If left unchecked (default), each person receives an email to complete their own registration details — no portal account required, though signup is offered. Either way, you pay upfront for every ticket.
                    </p>
                  </div>

                  <GroupShortcutsToggle
                    template={pricingTemplate}
                    tier={activeTier}
                    bracket={activeBracket}
                    allSameCountry={groupAllSameCountry}
                    allSameCategory={groupAllSameCategory}
                    onToggleCountry={setGroupAllSameCountry}
                    onToggleCategory={setGroupAllSameCategory}
                    sharedCountry={groupMembers[0]?.countryCode ?? ''}
                    sharedCategoryId={groupMembers[0]?.categoryId ?? null}
                    onSharedCountry={code => setGroupMembers(prev => prev.map(m => ({ ...m, countryCode: code })))}
                    onSharedCategory={id => setGroupMembers(prev => prev.map(m => ({ ...m, categoryId: id })))}
                  />

                  <div className="space-y-2">
                    {groupMembers.map((m, i) => (
                      <GroupPersonRow
                        key={i}
                        index={i}
                        isPrimary={false}
                        template={pricingTemplate}
                        tier={activeTier}
                        bracket={activeBracket}
                        name={m.name}
                        email={m.email}
                        countryCode={m.countryCode}
                        categoryId={m.categoryId}
                        hasAllInfo={groupHasAllInfo}
                        hideCountry={groupAllSameCountry}
                        hideCategory={groupAllSameCategory}
                        formFields={form.fields}
                        fullAnswers={m.fullAnswers}
                        onChange={patch => setGroupMembers(prev => prev.map((row, j) => j === i ? { ...row, ...patch } : row))}
                      />
                    ))}
                  </div>

                  {/* Grand total is shown once on the final Consent & Payment step
                      (RunningTotal inside the ticket field). Showing a duplicate here
                      would be incomplete anyway — the purchaser's own country/category
                      aren't guaranteed to be filled when this step runs. */}
                </div>
              )}
            </div>
          );
        }

        // Hide all non-RMS fields until a mode is chosen — only in single-page mode.
        // Stepped mode gates progression naturally via Next button validation, and the
        // RMS field lives on its own step so this guard would otherwise hide every field
        // on earlier steps until the user reaches the RMS step.
        const isSteppedMode = form.settings?.renderMode === 'stepped';
        if (!isSteppedMode && rmsField && registrationMode === null) return null;

        // Pending-claim: render usedForPricing country field as read-only (locked post-payment)
        if (isPendingClaim && field.type === 'country' && field.usedForPricing) {
          const currentCode = (answers[field.id] as string) ?? '';
          return (
            <div key={field.id} className="py-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {field.label}
              </label>
              <div className="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-sm">
                {getCountryName(currentCode) || currentCode || '—'} <span className="text-xs text-slate-400">(locked)</span>
              </div>
            </div>
          );
        }

        // Long / complex fields span both columns of the parent grid; short
        // single-input fields occupy one column so two can sit side-by-side.
        const FULL_WIDTH_TYPES = new Set([
          'textarea', 'ticket', 'radio', 'checkbox', 'boolean', 'registration-mode-selector',
        ]);
        const colSpan = FULL_WIDTH_TYPES.has(field.type as any) ? 'sm:col-span-2' : '';

        return (
        <div key={field.id} className={colSpan}>
          {field.type !== 'ticket' && field.type !== 'country' && (
            <label className="block text-xs font-display font-semibold text-gansid-on-surface/70 uppercase tracking-wide mb-1.5">
              {field.label} {field.required && <span className="text-gansid-primary">*</span>}
            </label>
          )}

          {field.type === 'country' ? (
            <CountryField
              label={field.label}
              required={field.required}
              value={(answers[field.id] as string) ?? ''}
              onChange={(code) => {
                onFieldChange(field.id, code);
                if (field.usedForPricing) setSelectedCountryCode(code);
              }}
            />
          ) : field.type === 'textarea' ? (
            <textarea
              className="w-full px-4 py-2.5 rounded-xl gradient-border-input focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 font-body text-sm"
              rows={3}
              placeholder={field.placeholder}
              value={answers[field.id] || ''}
              onChange={e => onFieldChange(field.id, e.target.value)}
            />
          ) : field.type === 'select' ? (
            <select
              className="w-full px-4 py-2.5 rounded-full gradient-border-input focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 font-body text-sm"
              value={answers[field.id] || ''}
              onChange={e => onFieldChange(field.id, e.target.value)}
            >
              <option value="">Select an option</option>
              {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          ) : field.type === 'ticket' ? (
            pricingTemplate ? (
              <div className="space-y-4">
                <PricingBracketBanner bracket={activeBracket} />
                <LivePriceCategory
                  template={pricingTemplate}
                  tier={activeTier}
                  bracket={activeBracket}
                  value={selectedCategoryId}
                  onChange={setSelectedCategoryId}
                />
                <AddonsList
                  template={pricingTemplate}
                  selectedIds={selectedAddonIds}
                  onToggle={setSelectedAddonIds}
                />
                <RunningTotal
                  template={pricingTemplate}
                  total={registrationMode === 'group' ? groupTotal : dynamicTotal}
                  bracket={activeBracket}
                  tier={activeTier}
                  // In group mode the total sums across members who can be in
                  // different tiers — don't show a single tier pill or it'd mislead.
                  showTier={registrationMode !== 'group'}
                  label={registrationMode === 'group' ? `Total (${1 + groupMembers.length} people — you + ${groupMembers.length} additional)` : undefined}
                />
              </div>
            ) : (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
              <div className="mb-4 pb-2 border-b border-gray-200">
                <span className="font-bold text-gray-900 block text-lg">{field.label}</span>
                <span className="text-xs text-gray-500">Select your tickets below</span>
              </div>

              {mode === 'purchaser' && (
                <>
                  <div className="space-y-4 mb-6">
                    {field.ticketConfig?.items.map(item => (
                      <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                        <div>
                          <div className="font-bold text-gray-800">{item.name}</div>
                          <div className="text-xs text-gray-500">{item.price > 0 ? `${item.price} ${field.ticketConfig?.currency}` : 'Free'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-400 uppercase font-bold">Qty</label>
                          <select
                            className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm focus:ring-indigo-500"
                            value={ticketQuantities[item.id] || 0}
                            onChange={e => onQuantityChange(item.id, parseInt(e.target.value))}
                          >
                            {[...Array((item.maxPerOrder || 5) + 1)].map((_, i) => (
                              <option key={i} value={i}>{i}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Promo Code */}
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text" placeholder="Promo Code"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={promoCode}
                      onChange={e => setPromoCode(e.target.value)}
                    />
                    <button
                      type="button" onClick={onApplyPromo}
                      className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                    >
                      Apply
                    </button>
                  </div>
                  {appliedPromo && (
                    <div className="text-xs text-green-600 flex items-center gap-1 mb-2">
                      <Tag className="w-3 h-3" /> Code applied: {appliedPromo.code}
                    </div>
                  )}
                </>
              )}

              {/* Donation and Guest Sections */}
              {mode === 'purchaser' && field.ticketConfig?.enableDonations && field.ticketConfig.items.some(item => (ticketQuantities[item.id] > 0) && (item.seats || 1) > 1) && (
                <div className="mb-4 pt-4 border-t border-gray-200 animate-in slide-in-from-top-2">
                  <div className="font-bold text-gray-800 mb-1">{field.ticketConfig?.donationSectionTitle || 'Donate a Table or Seats'}</div>
                  <p className="text-xs text-gray-500 mb-3">{field.ticketConfig?.donationSectionDescription || 'Are you donating this table or any seats?'}</p>
                  <div className="flex flex-wrap gap-3 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" value="no" name="donateOption" checked={donateOption === 'no'} onChange={() => { setDonateOption('no'); setDonatedSeats(0); setDonatedTables(0); }} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                      <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-600">No thanks</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" value="table" name="donateOption" checked={donateOption === 'table'} onChange={() => {
                        setDonateOption('table');
                        // Auto-calculate: 1 table donated by default
                        const tableItem = field.ticketConfig!.items.find(item => (ticketQuantities[item.id] > 0) && (item.seats || 1) > 1);
                        const seatsPerTable = tableItem?.seats || 8;
                        setDonatedTables(1);
                        setDonatedSeats(seatsPerTable);
                      }} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-600">Table</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" value="seats" name="donateOption" checked={donateOption === 'seats'} onChange={() => { setDonateOption('seats'); setDonatedTables(0); setDonatedSeats(0); }} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                      <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-600">Seats</span>
                    </label>
                  </div>

                  {donateOption === 'table' && (() => {
                    // Calculate total tables purchased (sum of quantities for table-type tickets)
                    const tableItems = field.ticketConfig!.items.filter(item => (ticketQuantities[item.id] > 0) && (item.seats || 1) > 1);
                    const totalTablesPurchased = tableItems.reduce((acc, item) => acc + (ticketQuantities[item.id] || 0), 0);
                    const seatsPerTable = tableItems[0]?.seats || 8;

                    return (
                      <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200 animate-in zoom-in-95 duration-200">
                        {totalTablesPurchased > 1 ? (
                          <>
                            <label className="block text-xs font-bold text-emerald-700 uppercase mb-1.5 flex items-center gap-2">
                              How many tables would you like to donate? <Check className="w-3 h-3" />
                            </label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                              value={donatedTables}
                              onChange={e => {
                                const tables = Math.max(0, parseInt(e.target.value) || 0);
                                setDonatedTables(tables);
                                setDonatedSeats(tables * seatsPerTable);
                              }}
                            >
                              {[...Array(totalTablesPurchased + 1)].map((_, i) => (
                                <option key={i} value={i}>{i} table{i !== 1 ? 's' : ''} ({i * seatsPerTable} seats)</option>
                              ))}
                            </select>
                          </>
                        ) : (
                          <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                            <Check className="w-4 h-4" />
                            Donating 1 table ({seatsPerTable} seats)
                          </div>
                        )}
                        <p className="text-[11px] text-emerald-600 mt-2">{field.ticketConfig?.donationHelpText || 'These seats will be made available for individuals who may not otherwise be able to attend.'}</p>
                      </div>
                    );
                  })()}

                  {donateOption === 'seats' && (
                    <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 animate-in zoom-in-95 duration-200">
                      <label className="block text-xs font-bold text-emerald-700 uppercase mb-1.5 flex items-center gap-2">{field.ticketConfig?.donationQuestionLabel || 'How many seats would you like to donate?'} <Check className="w-3 h-3" /> </label>
                      <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                        value={donatedSeats}
                        onChange={e => setDonatedSeats(Math.max(0, parseInt(e.target.value) || 0))}
                      >
                        {[...Array(11)].map((_, i) => <option key={i} value={i}>{i} seat{i !== 1 ? 's' : ''}</option>)}
                      </select>
                      <p className="text-[11px] text-emerald-600 mt-2">{field.ticketConfig?.donationHelpText || 'These seats will be made available for individuals who may not otherwise be able to attend.'}</p>
                    </div>
                  )}
                </div>
              )}

              {field.ticketConfig?.enableGuestDetails && guests.length > 0 && (
                <div className="mb-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-bold text-gray-800">Guest Details</div>
                    {mode === 'purchaser' && guests.length > 1 && (
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <input type="checkbox" checked={skipGuestDetails} onChange={e => setSkipGuestDetails(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 transition" />
                        <span className="text-[10px] font-bold text-gray-400 group-hover:text-indigo-600 uppercase tracking-widest transition-colors">Skip for now</span>
                      </label>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    {mode === 'guest' ? "Please confirm your registration details." : "Please provide details for each ticket holder."}
                  </p>

                  {(mode === 'guest' && isTableFull) ? (
                    <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex gap-3 text-red-700 animate-in zoom-in-95">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <p className="text-xs font-bold uppercase tracking-widest">Registrations are closed for this table as it has reached its full capacity.</p>
                    </div>
                  ) : skipGuestDetails ? (
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 animate-in zoom-in-95 duration-300">
                      <Info className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <p className="text-xs text-amber-800 leading-relaxed italic">
                        No problem! You can skip providing your guest names right now. After purchase, you can email your guest list to <a href="mailto:gala@sicklecellanemia.ca" className="font-bold underline hover:text-amber-900">gala@sicklecellanemia.ca</a> or use the unique guest registration link found on your ticket to invite them.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {guests.map((g, i) => (mode === 'purchaser' || i === 0) && (
                        <div key={i} className={`bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm transition-all ${mode === 'guest' ? 'ring-2 ring-indigo-500 bg-white ring-offset-2' : ''}`}>
                          <div className="text-[10px] font-black text-gray-400 uppercase mb-3 flex justify-between items-center">
                            <span>{mode === 'guest' ? "Your Details" : `Ticket #${i + 1}`}</span>
                            {(mode === 'purchaser' && i === 0) && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">Purchaser</span>}
                          </div>

                          {mode === 'purchaser' && i === 0 && isFirstGuestPurchaser ? (
                            <div className="mb-2">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                                <div className="bg-gray-100 text-gray-500 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-not-allowed select-none italic">
                                  {g.name || (form.fields.find(f => f.label.toLowerCase().includes('name')) ? '(Name from above)' : 'Purchaser Name')}
                                </div>
                                <div className="bg-gray-100 text-gray-500 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-not-allowed select-none italic">
                                  {g.email || (form.fields.find(f => f.label.toLowerCase().includes('email')) ? '(Email from above)' : 'Purchaser Email')}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => setIsFirstGuestPurchaser(false)}
                                className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                              >
                                Change to guest
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                <input
                                  type="text" placeholder="Guest Name"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                  value={g.name}
                                  onChange={e => {
                                    const newGuests = [...guests];
                                    newGuests[i].name = e.target.value;
                                    setGuests(newGuests);
                                  }}
                                />
                                <input
                                  type="email" placeholder="Guest Email"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                  value={g.email}
                                  onChange={e => {
                                    const newGuests = [...guests];
                                    newGuests[i].email = e.target.value;
                                    setGuests(newGuests);
                                  }}
                                />
                              </div>

                              <div className="flex items-center justify-between mt-1 mb-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Vegetarian?</span>
                                <div className="flex gap-4">
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="radio" name={`veg-${i}`} checked={g.dietary === 'no'} onChange={() => {
                                      const newGuests = [...guests];
                                      newGuests[i].dietary = 'no';
                                      setGuests(newGuests);
                                    }} className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-xs text-gray-600">No</span>
                                  </label>
                                  <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input type="radio" name={`veg-${i}`} checked={g.dietary === 'yes'} onChange={() => {
                                      const newGuests = [...guests];
                                      newGuests[i].dietary = 'yes';
                                      setGuests(newGuests);
                                    }} className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500" />
                                    <span className="text-xs text-gray-600">Yes</span>
                                  </label>
                                </div>
                              </div>

                              {field.ticketConfig?.enableAgeGroups && (
                                <div className="flex items-center justify-between mt-1">
                                  <span className="text-[10px] font-bold text-gray-500 uppercase">Guest Type</span>
                                  <div className="flex gap-4">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input type="radio" name={`age-${i}`} checked={g.guestType === 'adult' || !g.guestType} onChange={() => {
                                        const newGuests = [...guests];
                                        newGuests[i].guestType = 'adult';
                                        setGuests(newGuests);
                                      }} className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500" />
                                      <span className="text-xs text-gray-600">Adult</span>
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                      <input type="radio" name={`age-${i}`} checked={g.guestType === 'child'} onChange={() => {
                                        const newGuests = [...guests];
                                        newGuests[i].guestType = 'child';
                                        setGuests(newGuests);
                                      }} className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500" />
                                      <span className="text-xs text-gray-600">Child</span>
                                    </label>
                                  </div>
                                </div>
                              )}

                              {mode === 'purchaser' && i === 0 && !isFirstGuestPurchaser && (
                                <button type="button" onClick={() => setIsFirstGuestPurchaser(true)} className="text-xs text-gray-400 font-medium mt-2 hover:text-gray-600">
                                  Cancel (Use Purchaser Details)
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Totals */}
              {mode === 'purchaser' && (
                <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-700">Total:</span>
                  <span className="text-xl font-bold text-indigo-700">
                    {paymentTotal.toFixed(2)} {field.ticketConfig?.currency}
                  </span>
                </div>
              )}
            </div>
            )
          ) : field.type === 'radio' ? (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {field.options?.map(opt => {
                const isSelected = answers[field.id] === opt;
                return (
                  <label
                    key={opt}
                    className={[
                      'flex items-center gap-2 cursor-pointer rounded-full px-4 py-2.5 border-2 transition',
                      isSelected
                        ? 'border-gansid-primary bg-gansid-primary-container/10 font-semibold'
                        : 'border-gansid-outline-variant/40 hover:border-gansid-primary/50',
                    ].join(' ')}
                  >
                    <input
                      type="radio"
                      name={field.id}
                      checked={isSelected}
                      onChange={() => onFieldChange(field.id, opt)}
                      className="accent-gansid-primary"
                    />
                    <span className="text-sm text-gansid-on-surface">{opt}</span>
                  </label>
                );
              })}
            </div>
          ) : field.type === 'checkbox' ? (
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              {field.options?.map(opt => {
                const isChecked = answers[field.id]?.includes(opt);
                return (
                  <label
                    key={opt}
                    className={[
                      'flex items-center gap-2 cursor-pointer rounded-full px-4 py-2.5 border-2 transition',
                      isChecked
                        ? 'border-gansid-secondary bg-gansid-secondary/10 font-semibold'
                        : 'border-gansid-outline-variant/40 hover:border-gansid-secondary/50',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        const current = answers[field.id] || [];
                        if (e.target.checked) onFieldChange(field.id, [...current, opt]);
                        else onFieldChange(field.id, current.filter((v: string) => v !== opt));
                      }}
                      className="accent-gansid-secondary"
                    />
                    <span className="text-sm text-gansid-on-surface">{opt}</span>
                  </label>
                );
              })}
            </div>
          ) : field.type === 'boolean' ? (
            field.consentModal && field.linkText ? (
              <ConsentCheckbox
                id={field.id}
                label={field.label.replace(field.linkText, '').trim()}
                linkText={field.linkText}
                modalTitle={field.consentModal.title}
                modalUrl={field.consentModal.url}
                checked={!!answers[field.id]}
                onChange={v => onFieldChange(field.id, v)}
                required={field.required}
              />
            ) : (
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition cursor-pointer"
              onClick={() => onFieldChange(field.id, !answers[field.id])}
            >
              <span className="text-sm font-medium text-gray-700">{field.label}</span>
              <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${answers[field.id] ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${answers[field.id] ? 'translate-x-6' : ''}`}></div>
              </div>
            </div>
            )
          ) : (
            <div className="relative">
              {field.type === 'address' && <MapPin className="absolute left-3 top-3 w-4 h-4 text-gansid-on-surface/40 z-10" />}
              <input
                type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                inputMode={field.type === 'text' && field.validation === 'int' ? 'numeric' : undefined}
                className={`w-full ${field.type === 'address' ? 'pl-10 pr-4' : 'px-4'} py-2.5 rounded-full gradient-border-input focus:outline-none focus:ring-2 focus:ring-gansid-secondary/40 font-body text-sm`}
                placeholder={field.placeholder}
                value={answers[field.id] || ''}
                onChange={e => onFieldChange(field.id, e.target.value)}
              />
            </div>
          )}
        </div>
        );
      })}
    </>
  );
};
