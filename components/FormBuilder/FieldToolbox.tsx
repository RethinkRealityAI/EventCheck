import React from 'react';
import { Plus, Ticket, MapPin, CheckSquare, Type, AlignLeft, Mail, Phone, Hash, List, CircleDot, ListChecks, GripVertical } from 'lucide-react';
import { FieldType } from '../../types';

export const FIELD_TYPES: { type: FieldType; label: string; icon: any; color: string }[] = [
    { type: 'text', label: 'Short Text', icon: Type, color: '#6366F1' },
    { type: 'textarea', label: 'Long Text', icon: AlignLeft, color: '#8B5CF6' },
    { type: 'email', label: 'Email', icon: Mail, color: '#EC4899' },
    { type: 'phone', label: 'Phone', icon: Phone, color: '#14B8A6' },
    { type: 'number', label: 'Number', icon: Hash, color: '#F59E0B' },
    { type: 'address', label: 'Address', icon: MapPin, color: '#10B981' },
    { type: 'boolean', label: 'Yes / No', icon: CheckSquare, color: '#06B6D4' },
    { type: 'select', label: 'Dropdown', icon: List, color: '#F97316' },
    { type: 'radio', label: 'Single Choice', icon: CircleDot, color: '#EF4444' },
    { type: 'checkbox', label: 'Multi Choice', icon: ListChecks, color: '#8B5CF6' },
    { type: 'ticket', label: 'Tickets & Payment', icon: Ticket, color: '#4F46E5' },
];

interface FieldToolboxProps {
    onAddField: (type: FieldType) => void;
    onDragStart: (e: React.DragEvent, type: FieldType) => void;
    hasTicketField: boolean;
}

const FieldToolbox: React.FC<FieldToolboxProps> = ({ onAddField, onDragStart, hasTicketField }) => {
    return (
        <div className="fb-toolbox">
            <div className="fb-toolbox-header">
                <div className="fb-toolbox-title">
                    <Plus className="w-4 h-4" />
                    <span>Elements</span>
                </div>
                <span className="fb-toolbox-hint">Drag or click to add</span>
            </div>

            <div className="fb-toolbox-grid">
                {FIELD_TYPES.map(ft => {
                    const isDisabled = ft.type === 'ticket' && hasTicketField;
                    const Icon = ft.icon;
                    return (
                        <div
                            key={ft.type}
                            className={`fb-toolbox-item ${ft.type === 'ticket' ? 'fb-toolbox-item--ticket' : ''} ${isDisabled ? 'fb-toolbox-item--disabled' : ''}`}
                            draggable={!isDisabled}
                            onDragStart={e => !isDisabled && onDragStart(e, ft.type)}
                            onClick={() => !isDisabled && onAddField(ft.type)}
                            title={isDisabled ? 'Only one ticket block allowed per form' : `Add ${ft.label}`}
                        >
                            <div className="fb-toolbox-item-icon" style={{ color: ft.color }}>
                                <Icon className="w-4 h-4" />
                            </div>
                            <span className="fb-toolbox-item-label">{ft.label}</span>
                            <GripVertical className="fb-toolbox-item-grip" />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FieldToolbox;
