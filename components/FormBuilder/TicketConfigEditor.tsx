import React, { useEffect, useRef, useState } from 'react';
import { Plus, X, Trash2, Ticket, Tag, Settings, Info } from 'lucide-react';
import { Form, FormField, TicketItem, PromoCode, PricingTemplate } from '../../types';
import { getPricingTemplates } from '../../services/storageService';
import PromoCodesEditor from './PromoCodesEditor';

interface TicketConfigEditorProps {
    field: FormField;
    form: Form;
    onChange: (updated: FormField) => void;
    onFormChange: (next: Form) => void;
}

/** Normalize legacy ticket-field promos when moving to form.settings.promoCodes */
function normalizeLegacyPromo(p: PromoCode): PromoCode {
    return {
        ...p,
        code: (p.code ?? '').toUpperCase(),
        enabled: p.enabled !== false,
        type: p.type ?? 'percent',
        value: p.value ?? 100,
    };
}

const TicketConfigEditor: React.FC<TicketConfigEditorProps> = ({
    field,
    form,
    onChange,
    onFormChange,
}) => {
    const [templates, setTemplates] = useState<PricingTemplate[]>([]);
    const migratedRef = useRef(false);

    const config = field.ticketConfig;
    const pricingTemplateId = (form.settings as { pricingTemplateId?: string })?.pricingTemplateId ?? '';
    const usesDynamicPricing = !!pricingTemplateId && !!config;
    const selectedTemplate = templates.find(t => t.id === pricingTemplateId);
    const templateCategories = selectedTemplate?.categories ?? [];

    useEffect(() => {
        if (usesDynamicPricing) {
            getPricingTemplates().then(setTemplates);
        }
    }, [usesDynamicPricing, pricingTemplateId]);

    // One-time: move legacy ticketConfig.promoCodes → form.settings.promoCodes
    useEffect(() => {
        if (!config || migratedRef.current || !usesDynamicPricing) return;
        const settingsPromos = ((form.settings as { promoCodes?: PromoCode[] })?.promoCodes ?? [])
            .filter(p => (p.code ?? '').trim());
        const legacy = (config.promoCodes ?? []).filter(p => (p.code ?? '').trim());
        if (settingsPromos.length > 0 || legacy.length === 0) return;

        migratedRef.current = true;
        onChange({
            ...field,
            ticketConfig: { ...config, promoCodes: [] },
        });
        onFormChange({
            ...form,
            settings: {
                ...(form.settings ?? {}),
                promoCodes: legacy.map(normalizeLegacyPromo),
            } as Form['settings'],
        });
    }, [usesDynamicPricing, form, field, config, onChange, onFormChange]);

    if (!config) return null;

    const formPromoCodes: PromoCode[] =
        ((form.settings as { promoCodes?: PromoCode[] })?.promoCodes ?? []) as PromoCode[];
    const setFormPromoCodes = (next: PromoCode[]) => {
        onFormChange({
            ...form,
            settings: { ...(form.settings ?? {}), promoCodes: next } as Form['settings'],
        });
    };

    const addTicketItem = () => {
        const newItem: TicketItem = {
            id: `tix_${Date.now()}`,
            name: 'New Ticket Type',
            price: 0,
            inventory: 100,
            maxPerOrder: 10,
            seats: 1,
        };
        onChange({
            ...field,
            ticketConfig: { ...config, items: [...config.items, newItem] },
        });
    };

    const updateTicketItem = (index: number, updates: Partial<TicketItem>) => {
        const items = [...config.items];
        items[index] = { ...items[index], ...updates };
        onChange({ ...field, ticketConfig: { ...config, items } });
    };

    const deleteTicketItem = (index: number) => {
        onChange({
            ...field,
            ticketConfig: { ...config, items: config.items.filter((_, i) => i !== index) },
        });
    };

    const addPromoCode = () => {
        const newCode: PromoCode = { code: '', type: 'percent', value: 10 };
        onChange({
            ...field,
            ticketConfig: { ...config, promoCodes: [...config.promoCodes, newCode] },
        });
    };

    const updatePromoCode = (index: number, updates: Partial<PromoCode>) => {
        const codes = [...config.promoCodes];
        codes[index] = { ...codes[index], ...updates };
        onChange({ ...field, ticketConfig: { ...config, promoCodes: codes } });
    };

    const deletePromoCode = (index: number) => {
        onChange({
            ...field,
            ticketConfig: { ...config, promoCodes: config.promoCodes.filter((_, i) => i !== index) },
        });
    };

    const updateConfig = (updates: Partial<typeof config>) => {
        onChange({ ...field, ticketConfig: { ...config, ...updates } });
    };

    return (
        <div className="fb-ticket-config">
            {usesDynamicPricing ? (
                <div className="fb-ticket-section">
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs text-indigo-900 space-y-1">
                        <div className="flex items-start gap-2 font-medium">
                            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            <span>Dynamic pricing is enabled</span>
                        </div>
                        <p>
                            Registration categories and prices come from your linked pricing template
                            {selectedTemplate ? ` (${selectedTemplate.name})` : ''}.
                            Configure speaker categories under Settings → Pricing Templates.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="fb-ticket-section">
                    <h4 className="fb-ticket-section-title">
                        <Ticket className="w-4 h-4" /> Ticket Types
                    </h4>
                    <div className="fb-ticket-items">
                        {config.items.map((item, i) => (
                            <div key={item.id} className="fb-ticket-item">
                                <button onClick={() => deleteTicketItem(i)} className="fb-ticket-item-delete" title="Remove ticket type">
                                    <X className="w-3 h-3" />
                                </button>
                                <div className="fb-ticket-item-grid">
                                    <div className="fb-ticket-item-col">
                                        <div className="fb-field-group">
                                            <label className="fb-label-tiny">Name</label>
                                            <input
                                                type="text"
                                                className="fb-input-sm"
                                                placeholder="General Admission"
                                                value={item.name}
                                                onChange={e => updateTicketItem(i, { name: e.target.value })}
                                            />
                                        </div>
                                        <div className="fb-ticket-item-row">
                                            <div className="fb-field-group">
                                                <label className="fb-label-tiny">Seats</label>
                                                <input
                                                    type="number"
                                                    className="fb-input-sm"
                                                    placeholder="1"
                                                    value={item.seats || 1}
                                                    onChange={e => updateTicketItem(i, { seats: parseInt(e.target.value) })}
                                                />
                                            </div>
                                            <div className="fb-field-group">
                                                <label className="fb-label-tiny">Max / Order</label>
                                                <input
                                                    type="number"
                                                    className="fb-input-sm"
                                                    placeholder="5"
                                                    value={item.maxPerOrder}
                                                    onChange={e => updateTicketItem(i, { maxPerOrder: parseInt(e.target.value) })}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="fb-ticket-item-row">
                                        <div className="fb-field-group">
                                            <label className="fb-label-tiny">Price</label>
                                            <input
                                                type="number"
                                                className="fb-input-sm"
                                                placeholder="0"
                                                value={item.price}
                                                onChange={e => updateTicketItem(i, { price: parseFloat(e.target.value) })}
                                            />
                                        </div>
                                        <div className="fb-field-group">
                                            <label className="fb-label-tiny">Inventory</label>
                                            <input
                                                type="number"
                                                className="fb-input-sm"
                                                placeholder="100"
                                                value={item.inventory}
                                                onChange={e => updateTicketItem(i, { inventory: parseInt(e.target.value) })}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button onClick={addTicketItem} className="fb-add-button">
                            <Plus className="w-3 h-3" /> Add Ticket Type
                        </button>
                    </div>
                </div>
            )}

            {/* Promo Codes */}
            <div className="fb-ticket-section">
                <h4 className="fb-ticket-section-title">
                    <Tag className="w-4 h-4" /> Promo Codes
                </h4>
                {usesDynamicPricing ? (
                    <PromoCodesEditor
                        promoCodes={formPromoCodes}
                        onChange={setFormPromoCodes}
                        templateCategories={templateCategories}
                        compact
                    />
                ) : (
                    <div className="fb-ticket-items">
                        {config.promoCodes.map((code, i) => (
                            <div key={i} className="fb-promo-item">
                                <div className="fb-field-group" style={{ flex: 1 }}>
                                    <label className="fb-label-tiny">Code</label>
                                    <input
                                        type="text"
                                        className="fb-input-sm"
                                        placeholder="SAVE10"
                                        value={code.code}
                                        onChange={e => updatePromoCode(i, { code: e.target.value })}
                                    />
                                </div>
                                <div className="fb-field-group" style={{ width: 80 }}>
                                    <label className="fb-label-tiny">Type</label>
                                    <select
                                        className="fb-input-sm"
                                        value={code.type}
                                        onChange={e => updatePromoCode(i, { type: e.target.value as PromoCode['type'] })}
                                    >
                                        <option value="percent">% Off</option>
                                        <option value="fixed">$ Off</option>
                                    </select>
                                </div>
                                <div className="fb-field-group" style={{ width: 80 }}>
                                    <label className="fb-label-tiny">Value</label>
                                    <input
                                        type="number"
                                        className="fb-input-sm"
                                        value={code.value}
                                        onChange={e => updatePromoCode(i, { value: parseFloat(e.target.value) })}
                                    />
                                </div>
                                <button onClick={() => deletePromoCode(i)} className="fb-promo-delete" title="Remove code">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        <button onClick={addPromoCode} className="fb-add-button">
                            <Plus className="w-3 h-3" /> Add Promo Code
                        </button>
                    </div>
                )}
            </div>

            {/* Feature Toggles */}
            <div className="fb-ticket-section">
                <div className="fb-toggle-grid">
                    <label className="fb-toggle-card">
                        <input
                            type="checkbox"
                            className="fb-toggle-checkbox"
                            checked={config.enableDonations || false}
                            onChange={e => updateConfig({ enableDonations: e.target.checked })}
                        />
                        <div>
                            <span className="fb-toggle-title">Enable Donations</span>
                            <span className="fb-toggle-desc">Allow users to donate extra.</span>
                        </div>
                    </label>
                    <label className="fb-toggle-card">
                        <input
                            type="checkbox"
                            className="fb-toggle-checkbox"
                            checked={config.enableGuestDetails || false}
                            onChange={e => updateConfig({ enableGuestDetails: e.target.checked })}
                        />
                        <div>
                            <span className="fb-toggle-title">Guest Details</span>
                            <span className="fb-toggle-desc">Collect info for each guest.</span>
                        </div>
                    </label>
                    <label className="fb-toggle-card">
                        <input
                            type="checkbox"
                            className="fb-toggle-checkbox"
                            checked={config.enableAgeGroups || false}
                            onChange={e => updateConfig({ enableAgeGroups: e.target.checked })}
                        />
                        <div>
                            <span className="fb-toggle-title">Age Groups</span>
                            <span className="fb-toggle-desc">Collect Adult vs. Child.</span>
                        </div>
                    </label>
                </div>
            </div>

            {/* Donation Settings (expanded when enabled) */}
            {config.enableDonations && (
                <div className="fb-ticket-section fb-donation-settings">
                    <h5 className="fb-ticket-section-subtitle">
                        <Settings className="w-3 h-3" /> Donation Settings
                    </h5>
                    <div className="fb-field-group">
                        <label className="fb-label-tiny">Section Title</label>
                        <input
                            type="text"
                            className="fb-input-sm"
                            placeholder="Donate Extra Seats"
                            value={config.donationSectionTitle || ''}
                            onChange={e => updateConfig({ donationSectionTitle: e.target.value })}
                        />
                    </div>
                    <div className="fb-field-group">
                        <label className="fb-label-tiny">Description / Prompt</label>
                        <input
                            type="text"
                            className="fb-input-sm"
                            placeholder="Are you donating any seats at this table?"
                            value={config.donationSectionDescription || ''}
                            onChange={e => updateConfig({ donationSectionDescription: e.target.value })}
                        />
                    </div>
                    <div className="fb-field-group">
                        <label className="fb-label-tiny">Question Label</label>
                        <input
                            type="text"
                            className="fb-input-sm"
                            placeholder="How many seats would you like to donate?"
                            value={config.donationQuestionLabel || ''}
                            onChange={e => updateConfig({ donationQuestionLabel: e.target.value })}
                        />
                    </div>
                    <div className="fb-field-group">
                        <label className="fb-label-tiny">Help Text</label>
                        <input
                            type="text"
                            className="fb-input-sm"
                            placeholder="These seats will be made available for others."
                            value={config.donationHelpText || ''}
                            onChange={e => updateConfig({ donationHelpText: e.target.value })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default TicketConfigEditor;
