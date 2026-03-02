import React from 'react';
import { GripVertical, Settings, Trash2, Ticket } from 'lucide-react';
import { FormField } from '../../types';
import { FIELD_TYPES } from './FieldToolbox';

interface FieldCardProps {
    field: FormField;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onRemove: () => void;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    isDragOver: boolean;
    isDragging: boolean;
}

const FieldCard: React.FC<FieldCardProps> = ({
    field,
    index,
    isSelected,
    onSelect,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    isDragOver,
    isDragging,
}) => {
    const fieldMeta = FIELD_TYPES.find(t => t.type === field.type);
    const accentColor = fieldMeta?.color || '#6366F1';
    const Icon = fieldMeta?.icon || Settings;

    return (
        <>
            {/* Drop indicator line ABOVE this card */}
            {isDragOver && (
                <div className="fb-drop-indicator" />
            )}
            <div
                className={`fb-field-card ${isSelected ? 'fb-field-card--selected' : ''} ${field.type === 'ticket' ? 'fb-field-card--ticket' : ''} ${isDragging ? 'fb-field-card--dragging' : ''}`}
                onClick={onSelect}
                draggable
                onDragStart={onDragStart}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
            >
                {/* Left accent bar */}
                <div className="fb-field-card-accent" style={{ backgroundColor: accentColor }} />

                {/* Drag handle */}
                <div className="fb-field-card-grip" onMouseDown={e => e.stopPropagation()}>
                    <GripVertical className="w-4 h-4" />
                </div>

                {/* Field content */}
                <div className="fb-field-card-body">
                    <div className="fb-field-card-header">
                        <div className="fb-field-card-meta">
                            <div className="fb-field-card-icon" style={{ color: accentColor }}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="fb-field-card-label">{field.label}</div>
                                <div className="fb-field-card-type">{fieldMeta?.label || field.type}</div>
                            </div>
                        </div>
                        <div className="fb-field-card-badges">
                            {field.required && <span className="fb-badge fb-badge--required">Required</span>}
                            {field.conditional?.enabled && <span className="fb-badge fb-badge--conditional">Conditional</span>}
                        </div>
                    </div>

                    {/* Visual preview */}
                    <div className="fb-field-card-preview">
                        {field.type === 'textarea' ? (
                            <div className="fb-preview-textarea">
                                <span>{field.placeholder || 'Long text response...'}</span>
                            </div>
                        ) : ['text', 'email', 'phone', 'number', 'address'].includes(field.type) ? (
                            <div className="fb-preview-input">
                                <span>{field.placeholder || `${fieldMeta?.label}...`}</span>
                                {field.type === 'text' && field.validation === 'int' && (
                                    <span className="fb-preview-tag">INT</span>
                                )}
                            </div>
                        ) : field.type === 'boolean' ? (
                            <div className="fb-preview-toggle">
                                <div className="fb-preview-toggle-track">
                                    <div className="fb-preview-toggle-thumb" />
                                </div>
                                <span>Toggle Switch</span>
                            </div>
                        ) : ['select', 'radio', 'checkbox'].includes(field.type) ? (
                            <div className="fb-preview-options">
                                {(field.options || []).slice(0, 3).map((opt, i) => (
                                    <div key={i} className="fb-preview-option">
                                        <div className={`fb-preview-option-marker ${field.type === 'radio' ? 'fb-preview-option-marker--radio' : ''}`} />
                                        <span>{opt}</span>
                                    </div>
                                ))}
                                {(field.options || []).length > 3 && (
                                    <div className="fb-preview-more">+ {(field.options || []).length - 3} more</div>
                                )}
                            </div>
                        ) : field.type === 'ticket' ? (
                            <div className="fb-preview-tickets">
                                {field.ticketConfig?.items.slice(0, 3).map((item, i) => (
                                    <div key={i} className="fb-preview-ticket-item">
                                        <Ticket className="w-3.5 h-3.5" style={{ color: accentColor }} />
                                        <span className="fb-preview-ticket-name">{item.name}</span>
                                        <span className="fb-preview-ticket-price">{item.price} {field.ticketConfig?.currency}</span>
                                    </div>
                                ))}
                                {field.ticketConfig && field.ticketConfig.items.length > 3 && (
                                    <div className="fb-preview-more">+ {field.ticketConfig.items.length - 3} more types</div>
                                )}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Actions */}
                <div className="fb-field-card-actions">
                    <button
                        className={`fb-field-card-action ${isSelected ? 'fb-field-card-action--active' : ''}`}
                        onClick={e => { e.stopPropagation(); onSelect(); }}
                        title="Edit field"
                    >
                        <Settings className="w-3.5 h-3.5" />
                    </button>
                    <button
                        className="fb-field-card-action fb-field-card-action--delete"
                        onClick={e => { e.stopPropagation(); onRemove(); }}
                        title="Delete field"
                    >
                        <Trash2 className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>
        </>
    );
};

export default FieldCard;
