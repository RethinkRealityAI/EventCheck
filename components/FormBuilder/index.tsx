import React, { useState, useEffect } from 'react';
import { Save, ArrowLeft, Eye } from 'lucide-react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FormField, FieldType, Form } from '../../types';
import { getFormById, saveForm } from '../../services/storageService';
import { useNotifications } from '../NotificationSystem';
import FormPreview from '../FormPreview';
import FieldToolbox, { FIELD_TYPES } from './FieldToolbox';
import FieldCard from './FieldCard';
import FieldPropertiesPanel from './FieldPropertiesPanel';
import FormSettingsTab from './FormSettingsTab';
import './FormBuilder.css';

const FormBuilder: React.FC = () => {
    const { formId } = useParams<{ formId: string }>();
    const navigate = useNavigate();
    const [form, setForm] = useState<Form | null>(null);
    const [editingField, setEditingField] = useState<FormField | null>(null);
    const [activeTab, setActiveTab] = useState<'editor' | 'settings' | 'preview'>('editor');

    // DnD state
    const [draggedType, setDraggedType] = useState<FieldType | null>(null);
    const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);
    const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

    const { showNotification } = useNotifications();

    useEffect(() => {
        if (formId) {
            const fetchForm = async () => {
                const existing = await getFormById(formId);
                if (existing) {
                    setForm(existing);
                } else {
                    navigate('/admin/forms');
                }
            };
            fetchForm();
        }
    }, [formId, navigate]);

    // Sync editingField changes to form state immediately
    useEffect(() => {
        if (editingField) {
            setForm(prev => {
                if (!prev) return prev;
                return {
                    ...prev,
                    fields: prev.fields.map(f => f.id === editingField.id ? editingField : f)
                };
            });
        }
    }, [editingField]);

    const save = async () => {
        if (form) {
            await saveForm(form);
            showNotification('Form configuration saved successfully', 'success');
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'logo' | 'card_background') => {
        const file = e.target.files?.[0];
        if (!file || !form) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            if (type === 'background') {
                updateFormMetadata({ settings: { ...form.settings, formBackgroundImage: base64String } });
            } else if (type === 'card_background') {
                updateFormMetadata({ settings: { ...form.settings, cardBackgroundImage: base64String } });
            } else {
                updateFormMetadata({ pdfSettings: { ...form.pdfSettings, logoUrl: base64String } });
            }
            showNotification('Image uploaded successfully', 'success');
        };
        reader.readAsDataURL(file);
    };

    const updateFormMetadata = (updates: Partial<Form>) => {
        if (form) setForm({ ...form, ...updates });
    };

    // --- Field Operations ---
    const createField = (type: FieldType): FormField | null => {
        if (!form) return null;
        if (type === 'ticket' && form.fields.find(f => f.type === 'ticket')) {
            showNotification("You can only have one Ticket block per form.", 'warning');
            return null;
        }
        const friendlyName = FIELD_TYPES.find(f => f.type === type)?.label || type;
        const newField: FormField = {
            id: `field_${Date.now()}`,
            type,
            label: type === 'ticket' ? 'Select Tickets' : `New ${friendlyName}`,
            required: type === 'ticket',
            options: ['select', 'radio', 'checkbox'].includes(type) ? ['Option 1', 'Option 2'] : undefined,
            ticketConfig: type === 'ticket' ? {
                currency: 'CAD',
                items: [{ id: `tix_${Date.now()}`, name: 'General Admission', price: 10, inventory: 100, maxPerOrder: 5 }],
                promoCodes: [],
            } : undefined,
        };
        if (!form.settings) {
            updateFormMetadata({ settings: { currency: 'CAD', showQrOnSuccess: true, showTicketButtonOnSuccess: true } });
        }
        return newField;
    };

    const addField = (type: FieldType) => {
        const newField = createField(type);
        if (!newField || !form) return;
        setForm({ ...form, fields: [...form.fields, newField] });
        setEditingField(newField);
        if (activeTab !== 'editor') setActiveTab('editor');
    };

    const insertFieldAt = (type: FieldType, index: number) => {
        const newField = createField(type);
        if (!newField || !form) return;
        const fields = [...form.fields];
        fields.splice(index, 0, newField);
        setForm({ ...form, fields });
        setEditingField(newField);
    };

    const removeField = (id: string) => {
        if (!form) return;
        if (confirm('Delete this field?')) {
            setForm({ ...form, fields: form.fields.filter(f => f.id !== id) });
            if (editingField?.id === id) setEditingField(null);
            showNotification('Field removed', 'info');
        }
    };

    const moveField = (fromIndex: number, toIndex: number) => {
        if (!form) return;
        const fields = [...form.fields];
        const [moved] = fields.splice(fromIndex, 1);
        fields.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
        setForm({ ...form, fields });
    };

    // --- Drag & Drop Handlers ---
    const handleToolboxDragStart = (e: React.DragEvent, type: FieldType) => {
        setDraggedType(type);
        setDraggedFieldIndex(null);
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('text/plain', type);
    };

    const handleFieldDragStart = (e: React.DragEvent, index: number) => {
        setDraggedFieldIndex(index);
        setDraggedType(null);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
    };

    const handleDragOver = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = draggedType ? 'copy' : 'move';
        setDropTargetIndex(targetIndex);
    };

    const handleDrop = (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault();
        e.stopPropagation();

        if (draggedType) {
            // Dropping from toolbox - insert at position
            insertFieldAt(draggedType, targetIndex);
        } else if (draggedFieldIndex !== null && draggedFieldIndex !== targetIndex) {
            // Reordering on canvas
            moveField(draggedFieldIndex, targetIndex);
        }

        setDraggedType(null);
        setDraggedFieldIndex(null);
        setDropTargetIndex(null);
    };

    const handleCanvasDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = draggedType ? 'copy' : 'move';
        // If dragging over the empty space at the bottom, set drop index to end
        if (form) setDropTargetIndex(form.fields.length);
    };

    const handleCanvasDrop = (e: React.DragEvent) => {
        if (form) {
            handleDrop(e, form.fields.length);
        }
    };

    const handleDragEnd = () => {
        setDraggedType(null);
        setDraggedFieldIndex(null);
        setDropTargetIndex(null);
    };

    if (!form) {
        return (
            <div className="fb-loading">
                <div className="fb-loading-spinner" />
                <span>Loading form...</span>
            </div>
        );
    }

    return (
        <div className="fb-root">
            {/* Top Header */}
            <div className="fb-header">
                <div className="fb-header-left">
                    <Link to="/admin/forms" className="fb-header-back">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div className="fb-header-info">
                        <h2 className="fb-header-title">{form.title}</h2>
                        <p className="fb-header-subtitle">Form Builder</p>
                    </div>
                </div>
                <div className="fb-header-right">
                    <div className="fb-tab-bar">
                        <button
                            onClick={() => setActiveTab('editor')}
                            className={`fb-tab ${activeTab === 'editor' ? 'fb-tab--active' : ''}`}
                        >
                            Editor
                        </button>
                        <button
                            onClick={() => setActiveTab('preview')}
                            className={`fb-tab ${activeTab === 'preview' ? 'fb-tab--active' : ''}`}
                        >
                            <Eye className="w-4 h-4" /> Preview
                        </button>
                        <button
                            onClick={() => setActiveTab('settings')}
                            className={`fb-tab ${activeTab === 'settings' ? 'fb-tab--active' : ''}`}
                        >
                            Settings
                        </button>
                    </div>
                    <button onClick={save} className="fb-save-btn">
                        <Save className="w-4 h-4" /> Save
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="fb-body">
                {activeTab === 'editor' && (
                    <div className="fb-editor">
                        {/* Sidebar - Field Toolbox */}
                        <FieldToolbox
                            onAddField={addField}
                            onDragStart={handleToolboxDragStart}
                            hasTicketField={!!form.fields.find(f => f.type === 'ticket')}
                        />

                        {/* Canvas */}
                        <div className="fb-canvas-wrapper">
                            <div className="fb-canvas-header">
                                <input
                                    type="text"
                                    className="fb-canvas-title"
                                    value={form.title}
                                    onChange={e => updateFormMetadata({ title: e.target.value })}
                                    placeholder="Event Title"
                                />
                                <input
                                    type="text"
                                    className="fb-canvas-description"
                                    value={form.description}
                                    onChange={e => updateFormMetadata({ description: e.target.value })}
                                    placeholder="Event Description"
                                />
                            </div>

                            <div
                                className={`fb-canvas ${(draggedType || draggedFieldIndex !== null) ? 'fb-canvas--drag-active' : ''}`}
                                onDragOver={handleCanvasDragOver}
                                onDrop={handleCanvasDrop}
                                onDragLeave={() => setDropTargetIndex(null)}
                            >
                                {form.fields.length === 0 ? (
                                    <div className={`fb-canvas-empty ${draggedType ? 'fb-canvas-empty--active' : ''}`}>
                                        <div className="fb-canvas-empty-icon">
                                            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                                                <rect x="8" y="12" width="32" height="8" rx="4" fill="#E0E7FF" />
                                                <rect x="8" y="24" width="24" height="8" rx="4" fill="#C7D2FE" />
                                                <rect x="8" y="36" width="28" height="8" rx="4" fill="#E0E7FF" />
                                            </svg>
                                        </div>
                                        <h4 className="fb-canvas-empty-title">
                                            {draggedType ? 'Drop here to add' : 'Start building your form'}
                                        </h4>
                                        <p className="fb-canvas-empty-subtitle">
                                            {draggedType ? 'Release to place the field here' : 'Drag elements from the sidebar or click to add'}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="fb-canvas-fields">
                                        {form.fields.map((field, index) => (
                                            <FieldCard
                                                key={field.id}
                                                field={field}
                                                index={index}
                                                isSelected={editingField?.id === field.id}
                                                onSelect={() => {
                                                    if (editingField?.id === field.id) {
                                                        setEditingField(null);
                                                    } else {
                                                        // Always grab the latest version from form.fields
                                                        const latest = form.fields.find(f => f.id === field.id);
                                                        setEditingField(latest || field);
                                                    }
                                                }}
                                                onRemove={() => removeField(field.id)}
                                                onDragStart={e => handleFieldDragStart(e, index)}
                                                onDragOver={e => handleDragOver(e, index)}
                                                onDrop={e => handleDrop(e, index)}
                                                onDragEnd={handleDragEnd}
                                                isDragOver={dropTargetIndex === index}
                                                isDragging={draggedFieldIndex === index}
                                            />
                                        ))}
                                        {/* Drop zone at the very end */}
                                        {dropTargetIndex === form.fields.length && (draggedType || draggedFieldIndex !== null) && (
                                            <div className="fb-drop-indicator" />
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right-side Properties Panel */}
                        {editingField && (
                            <FieldPropertiesPanel
                                field={editingField}
                                form={form}
                                onChange={updated => setEditingField(updated)}
                                onClose={() => setEditingField(null)}
                            />
                        )}
                    </div>
                )}

                {activeTab === 'settings' && (
                    <FormSettingsTab
                        form={form}
                        onUpdate={updateFormMetadata}
                        onImageUpload={handleImageUpload}
                    />
                )}

                {activeTab === 'preview' && (
                    <FormPreview form={form} />
                )}
            </div>
        </div>
    );
};

export default FormBuilder;
