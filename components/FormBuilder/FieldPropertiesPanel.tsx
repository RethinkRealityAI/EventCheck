import React from 'react';
import { X, Plus, Layout } from 'lucide-react';
import { FormField, Form } from '../../types';
import TicketConfigEditor from './TicketConfigEditor';

interface FieldPropertiesPanelProps {
    field: FormField;
    form: Form;
    onChange: (updated: FormField) => void;
    onClose: () => void;
}

const FieldPropertiesPanel: React.FC<FieldPropertiesPanelProps> = ({ field, form, onChange, onClose }) => {
    const update = (updates: Partial<FormField>) => onChange({ ...field, ...updates });

    return (
        <div className="fb-properties">
            <div className="fb-properties-header">
                <h3 className="fb-properties-title">Field Properties</h3>
                <button onClick={onClose} className="fb-properties-close">
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="fb-properties-body">
                {/* Label */}
                <div className="fb-field-group">
                    <label className="fb-label">Field Label</label>
                    <input
                        type="text"
                        className="fb-input"
                        value={field.label}
                        onChange={e => update({ label: e.target.value })}
                    />
                </div>

                {/* Non-ticket fields: placeholder, required, validation */}
                {field.type !== 'ticket' && (
                    <>
                        <div className="fb-field-group">
                            <label className="fb-label">Placeholder</label>
                            <input
                                type="text"
                                className="fb-input"
                                value={field.placeholder || ''}
                                onChange={e => update({ placeholder: e.target.value })}
                            />
                        </div>

                        <label className="fb-checkbox-label">
                            <input
                                type="checkbox"
                                className="fb-checkbox"
                                checked={field.required}
                                onChange={e => update({ required: e.target.checked })}
                            />
                            <span>Required field</span>
                        </label>

                        {field.type === 'text' && (
                            <div className="fb-field-group">
                                <label className="fb-label">Input Validation</label>
                                <select
                                    className="fb-input"
                                    value={field.validation || 'string'}
                                    onChange={e => update({ validation: e.target.value as 'string' | 'int' })}
                                >
                                    <option value="string">Any Text (String)</option>
                                    <option value="int">Whole Numbers Only (Integer)</option>
                                </select>
                            </div>
                        )}
                    </>
                )}

                {/* Options editor for select/radio/checkbox */}
                {['select', 'radio', 'checkbox'].includes(field.type) && (
                    <div className="fb-field-group">
                        <label className="fb-label">Options</label>
                        <div className="fb-options-list">
                            {(field.options || []).map((option, optIdx) => (
                                <div key={optIdx} className="fb-option-row">
                                    <input
                                        type="text"
                                        className="fb-input"
                                        value={option}
                                        onChange={e => {
                                            const newOptions = [...(field.options || [])];
                                            newOptions[optIdx] = e.target.value;
                                            update({ options: newOptions });
                                        }}
                                        placeholder={`Option ${optIdx + 1}`}
                                    />
                                    <button
                                        onClick={() => update({ options: (field.options || []).filter((_, i) => i !== optIdx) })}
                                        className="fb-option-delete"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                            <button
                                onClick={() => update({ options: [...(field.options || []), `Option ${(field.options || []).length + 1}`] })}
                                className="fb-add-option"
                            >
                                <Plus className="w-3 h-3" /> Add Option
                            </button>
                        </div>
                    </div>
                )}

                {/* Conditional Visibility */}
                <div className="fb-conditional-section">
                    <div className="fb-conditional-header">
                        <label className="fb-label fb-label--inline">
                            <Layout className="w-4 h-4 text-indigo-600" /> Conditional Visibility
                        </label>
                        <div
                            className={`fb-switch ${field.conditional?.enabled ? 'fb-switch--on' : ''}`}
                            onClick={() => update({
                                conditional: {
                                    enabled: !field.conditional?.enabled,
                                    fieldId: field.conditional?.fieldId || '',
                                    value: field.conditional?.value || '',
                                }
                            })}
                        >
                            <div className="fb-switch-thumb" />
                        </div>
                    </div>

                    {field.conditional?.enabled && (
                        <div className="fb-conditional-body">
                            <div className="fb-field-group">
                                <label className="fb-label-tiny">Show if question...</label>
                                <select
                                    className="fb-input"
                                    value={field.conditional.fieldId}
                                    onChange={e => update({
                                        conditional: { ...field.conditional!, fieldId: e.target.value, value: '' }
                                    })}
                                >
                                    <option value="">Select a question</option>
                                    {form.fields
                                        .filter(f => f.id !== field.id && f.type !== 'ticket')
                                        .map(f => (
                                            <option key={f.id} value={f.id}>{f.label}</option>
                                        ))}
                                </select>
                            </div>
                            <div className="fb-field-group">
                                <label className="fb-label-tiny">Equals...</label>
                                {(() => {
                                    const targetField = form.fields.find(f => f.id === field.conditional?.fieldId);
                                    if (targetField && (targetField.options?.length || 0) > 0) {
                                        return (
                                            <select
                                                className="fb-input"
                                                value={field.conditional.value}
                                                onChange={e => update({
                                                    conditional: { ...field.conditional!, value: e.target.value }
                                                })}
                                            >
                                                <option value="">Select an option</option>
                                                {targetField.options?.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        );
                                    }
                                    if (targetField?.type === 'boolean') {
                                        return (
                                            <select
                                                className="fb-input"
                                                value={field.conditional.value}
                                                onChange={e => update({
                                                    conditional: { ...field.conditional!, value: e.target.value }
                                                })}
                                            >
                                                <option value="">Select an option</option>
                                                <option value="true">Yes (True)</option>
                                                <option value="false">No (False)</option>
                                            </select>
                                        );
                                    }
                                    return (
                                        <input
                                            type="text"
                                            className="fb-input"
                                            placeholder="Enter value"
                                            value={field.conditional.value || ''}
                                            onChange={e => update({
                                                conditional: { ...field.conditional!, value: e.target.value }
                                            })}
                                        />
                                    );
                                })()}
                            </div>
                            <p className="fb-hint">This field will only display if the selected question matches the specified value.</p>
                        </div>
                    )}
                </div>

                {/* Country: used-for-pricing toggle */}
                {field.type === 'country' && (() => {
                    const anotherFlagged = form.fields.some(
                        f => f.id !== field.id && f.type === 'country' && f.usedForPricing === true
                    );
                    return (
                        <div className="fb-field-group">
                            <label className="fb-label">Dynamic Pricing</label>
                            <label className={`fb-checkbox-label ${anotherFlagged ? 'opacity-50' : ''}`}>
                                <input
                                    type="checkbox"
                                    className="fb-checkbox"
                                    checked={!!field.usedForPricing}
                                    disabled={anotherFlagged}
                                    onChange={e => update({ usedForPricing: e.target.checked })}
                                />
                                <span>Use this country for dynamic pricing</span>
                            </label>
                            {anotherFlagged ? (
                                <p className="fb-hint text-amber-600">Another country field is already flagged for pricing. Disable that first.</p>
                            ) : (
                                <p className="fb-hint">When on, the registrant's selected country determines their pricing tier. Only one country field per form can be flagged.</p>
                            )}
                        </div>
                    );
                })()}

                {/* Registration Mode Selector config */}
                {field.type === 'registration-mode-selector' && (
                    <>
                        <div className="fb-field-group">
                            <label className="fb-checkbox-label">
                                <input
                                    type="checkbox"
                                    className="fb-checkbox"
                                    checked={field.groupEnabled ?? true}
                                    onChange={e => update({ groupEnabled: e.target.checked })}
                                />
                                <span>Group mode enabled</span>
                            </label>
                            <p className="fb-hint">
                                When off, only the Individual path is available.
                            </p>
                        </div>
                        <div className="fb-field-group">
                            <label className="fb-label">Max group size</label>
                            <input
                                type="number"
                                className="fb-input"
                                min={2}
                                max={10}
                                value={field.groupMaxSize ?? 5}
                                onChange={e => update({ groupMaxSize: Math.max(2, Math.min(10, Number(e.target.value))) })}
                            />
                            <p className="fb-hint">Maximum number of people in a group (2–10).</p>
                        </div>
                        <div className="fb-field-group">
                            <label className="fb-label">Individual label</label>
                            <input
                                type="text"
                                className="fb-input"
                                value={field.individualLabel ?? ''}
                                placeholder="Individual — just me"
                                onChange={e => update({ individualLabel: e.target.value })}
                            />
                        </div>
                        <div className="fb-field-group">
                            <label className="fb-label">Group label</label>
                            <input
                                type="text"
                                className="fb-input"
                                value={field.groupLabel ?? ''}
                                placeholder="Group — up to 5 people"
                                onChange={e => update({ groupLabel: e.target.value })}
                            />
                        </div>
                    </>
                )}

                {/* Ticket Config */}
                {field.type === 'ticket' && field.ticketConfig && (
                    <TicketConfigEditor field={field} onChange={onChange} />
                )}
            </div>
        </div>
    );
};

export default FieldPropertiesPanel;
