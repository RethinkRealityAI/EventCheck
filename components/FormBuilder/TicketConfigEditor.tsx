import React from 'react';
import { Plus, X, Trash2, Ticket, Tag, Settings } from 'lucide-react';
import { FormField, TicketItem, PromoCode } from '../../types';

interface TicketConfigEditorProps {
    field: FormField;
    onChange: (updated: FormField) => void;
}

const TicketConfigEditor: React.FC<TicketConfigEditorProps> = ({ field, onChange }) => {
    if (!field.ticketConfig) return null;
    const config = field.ticketConfig;

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
            {/* Ticket Types */}
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

            {/* Promo Codes */}
            <div className="fb-ticket-section">
                <h4 className="fb-ticket-section-title">
                    <Tag className="w-4 h-4" /> Promo Codes
                </h4>
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
                                    onChange={e => updatePromoCode(i, { type: e.target.value as any })}
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
