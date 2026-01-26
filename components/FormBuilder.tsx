import React, { useState, useEffect } from 'react';
import { Plus, Trash2, MoveUp, MoveDown, Settings, Save, ArrowLeft, X, Ticket, MessageSquare, Layout, CreditCard, Tag, Eye, AlertCircle, ArrowRight, Loader2, Check, RefreshCw } from 'lucide-react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FormField, FieldType, Form, PromoCode, TicketItem, Attendee } from '../types';
import { getFormById, saveForm, saveAttendee } from '../services/storageService';
import RichTextEditor from './RichTextEditor';

const FIELD_TYPES: { type: FieldType, label: string, icon?: any }[] = [
  { type: 'text', label: 'Short Text' },
  { type: 'textarea', label: 'Long Text' },
  { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' },
  { type: 'number', label: 'Number' },
  { type: 'select', label: 'Dropdown' },
  { type: 'radio', label: 'Radio Choice' },
  { type: 'checkbox', label: 'Checkboxes' },
  { type: 'ticket', label: 'Tickets & Payment', icon: Ticket },
];

const FormBuilder: React.FC = () => {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  const [form, setForm] = useState<Form | null>(null);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'settings' | 'preview'>('editor');
  
  // Preview State
  const [previewStep, setPreviewStep] = useState<'form' | 'payment' | 'success'>('form');
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
  const [previewTicketQuantities, setPreviewTicketQuantities] = useState<Record<string, number>>({});
  const [previewPaymentTotal, setPreviewPaymentTotal] = useState<number>(0);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    if (formId) {
      const existing = getFormById(formId);
      if (existing) {
        setForm(existing);
      } else {
        navigate('/admin/forms');
      }
    }
  }, [formId, navigate]);

  // Recalculate totals for preview
  useEffect(() => {
     if (activeTab === 'preview' && form) {
        const ticketField = form.fields.find(f => f.type === 'ticket');
        if (ticketField && ticketField.ticketConfig) {
           let total = 0;
           ticketField.ticketConfig.items.forEach(item => {
              total += (item.price * (previewTicketQuantities[item.id] || 0));
           });
           setPreviewPaymentTotal(total);
        }
     }
  }, [previewTicketQuantities, activeTab, form]);

  const save = () => {
    if (form) {
      saveForm(form);
      alert('Form saved successfully!');
    }
  };

  const updateFormMetadata = (updates: Partial<Form>) => {
    if (form) {
      setForm({ ...form, ...updates });
    }
  };

  const addField = (type: FieldType) => {
    if (!form) return;
    
    if (type === 'ticket' && form.fields.find(f => f.type === 'ticket')) {
      alert("You can only have one Ticket block per form.");
      return;
    }

    const newField: FormField = {
      id: `field_${Date.now()}`,
      type,
      label: type === 'ticket' ? 'Select Tickets' : `New ${type} field`,
      required: type === 'ticket', 
      options: type === 'select' || type === 'radio' || type === 'checkbox' ? ['Option 1', 'Option 2'] : undefined,
      ticketConfig: type === 'ticket' ? {
        currency: 'USD',
        items: [
           { id: `tix_${Date.now()}`, name: 'General Admission', price: 10, inventory: 100, maxPerOrder: 5 }
        ],
        promoCodes: []
      } : undefined
    };
    setForm({ ...form, fields: [...form.fields, newField] });
    setEditingField(newField);
    if (activeTab !== 'editor') setActiveTab('editor');
  };

  const removeField = (id: string) => {
    if (!form) return;
    if (confirm('Delete this field?')) {
      setForm({ ...form, fields: form.fields.filter(f => f.id !== id) });
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    if (!form) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === form.fields.length - 1) return;
    
    const newFields = [...form.fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setForm({ ...form, fields: newFields });
  };

  const saveFieldUpdates = (updated: FormField) => {
    if (!form) return;
    setForm({ ...form, fields: form.fields.map(f => f.id === updated.id ? updated : f) });
    setEditingField(null);
  };

  // --- Ticket Helpers ---
  const addTicketItem = () => {
    if (!editingField?.ticketConfig) return;
    const newItem: TicketItem = {
      id: `tix_${Date.now()}`,
      name: 'New Ticket Type',
      price: 0,
      inventory: 100,
      maxPerOrder: 10
    };
    setEditingField({
      ...editingField,
      ticketConfig: {
        ...editingField.ticketConfig,
        items: [...editingField.ticketConfig.items, newItem]
      }
    });
  };

  const updateTicketItem = (index: number, updates: Partial<TicketItem>) => {
    if (!editingField?.ticketConfig) return;
    const newItems = [...editingField.ticketConfig.items];
    newItems[index] = { ...newItems[index], ...updates };
    setEditingField({
      ...editingField,
      ticketConfig: { ...editingField.ticketConfig, items: newItems }
    });
  };

  const deleteTicketItem = (index: number) => {
    if (!editingField?.ticketConfig) return;
    const newItems = editingField.ticketConfig.items.filter((_, i) => i !== index);
    setEditingField({
      ...editingField,
      ticketConfig: { ...editingField.ticketConfig, items: newItems }
    });
  };

  const addPromoCode = () => {
    if (!editingField?.ticketConfig) return;
    const newCode: PromoCode = { code: 'SAVE10', type: 'percent', value: 10 };
    setEditingField({
      ...editingField,
      ticketConfig: {
        ...editingField.ticketConfig,
        promoCodes: [...editingField.ticketConfig.promoCodes, newCode]
      }
    });
  };

  const updatePromoCode = (index: number, updates: Partial<PromoCode>) => {
    if (!editingField?.ticketConfig) return;
    const codes = [...editingField.ticketConfig.promoCodes];
    codes[index] = { ...codes[index], ...updates };
    setEditingField({
      ...editingField,
      ticketConfig: { ...editingField.ticketConfig, promoCodes: codes }
    });
  };

  const deletePromoCode = (index: number) => {
    if (!editingField?.ticketConfig) return;
    const codes = editingField.ticketConfig.promoCodes.filter((_, i) => i !== index);
    setEditingField({
      ...editingField,
      ticketConfig: { ...editingField.ticketConfig, promoCodes: codes }
    });
  };

  // --- Preview Logic ---
  const isFieldVisibleInPreview = (field: FormField) => {
    if (!field.conditional?.enabled) return true;
    const targetValue = previewAnswers[field.conditional.fieldId];
    return targetValue === field.conditional.value;
  };

  const handlePreviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;

    // Basic validation
    let isValid = true;
    for (const field of form.fields) {
        if (isFieldVisibleInPreview(field) && field.required && !previewAnswers[field.id] && field.type !== 'ticket') {
           isValid = false;
        }
    }
    const ticketField = form.fields.find(f => f.type === 'ticket');
    if (ticketField && ticketField.required) {
       const totalQty = Object.values(previewTicketQuantities).reduce((a: number, b: number) => a + b, 0);
       if (totalQty === 0) isValid = false;
    }

    if (!isValid) {
      setPreviewError('Please fill in all required fields in the preview.');
      return;
    }
    setPreviewError('');

    if (previewPaymentTotal > 0) {
      setPreviewStep('payment');
    } else {
      finalizePreview();
    }
  };

  const finalizePreview = () => {
    if (!form) return;
    setPreviewLoading(true);
    
    setTimeout(() => {
       const submissionId = `TEST-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
       const emailField = form.fields.find(f => f.type === 'email');
       const nameField = form.fields.find(f => f.type === 'text');
       
       const ticketSummary = Object.entries(previewTicketQuantities)
         .filter(([_, qty]) => qty > 0)
         .map(([id, qty]) => {
            const item = form.fields.find(f => f.type === 'ticket')?.ticketConfig?.items.find(i => i.id === id);
            return item ? `${item.name} x${qty}` : '';
         }).join(', ') || 'Preview Ticket';

       const newAttendee: Attendee = {
         id: submissionId,
         formId: form.id,
         formTitle: `${form.title}`,
         name: nameField ? previewAnswers[nameField.id] : 'Test User',
         email: emailField ? previewAnswers[emailField.id] : 'test@example.com',
         ticketType: ticketSummary,
         registeredAt: new Date().toISOString(),
         paymentStatus: previewPaymentTotal > 0 ? 'paid' : 'free',
         qrPayload: 'test-qr-payload',
         isTest: true,
         answers: previewAnswers
       };

       saveAttendee(newAttendee);
       setPreviewLoading(false);
       setPreviewStep('success');
    }, 1500);
  };

  const resetPreview = () => {
    setPreviewStep('form');
    setPreviewAnswers({});
    setPreviewTicketQuantities({});
    setPreviewPaymentTotal(0);
    setPreviewError('');
  };

  if (!form) return <div className="p-8">Loading...</div>;

  return (
    <div className="flex flex-col lg:h-[calc(100vh-100px)] relative h-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm gap-4 mb-6 flex-shrink-0 sticky top-0 z-20 lg:static">
         <div className="flex items-center gap-4">
            <Link to="/admin/forms" className="text-gray-500 hover:text-gray-900">
               <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h2 className="text-xl font-bold text-gray-900 truncate max-w-[200px] sm:max-w-md">{form.title}</h2>
              <p className="text-xs text-gray-500">Last saved: {new Date().toLocaleTimeString()}</p>
            </div>
         </div>
         <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
            <div className="flex bg-gray-100 p-1 rounded-lg">
                <button 
                  onClick={() => setActiveTab('editor')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${activeTab === 'editor' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Editor
                </button>
                <button 
                  onClick={() => setActiveTab('preview')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap flex items-center gap-1 ${activeTab === 'preview' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button 
                  onClick={() => setActiveTab('settings')}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${activeTab === 'settings' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  Settings
                </button>
            </div>
             <button 
                onClick={save}
                className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition shadow-sm font-medium whitespace-nowrap ml-auto sm:ml-0"
              >
                <Save className="w-4 h-4" /> Save
              </button>
         </div>
      </div>

      {activeTab === 'editor' && (
        <div className="flex flex-col lg:flex-row gap-6 flex-1 lg:overflow-hidden h-auto lg:h-full">
          {/* Sidebar - Field Types */}
          <div className="w-full lg:w-72 bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex-shrink-0 lg:overflow-y-auto lg:h-full h-auto">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Layout className="w-4 h-4" /> Add Elements
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {FIELD_TYPES.map(ft => (
                <button
                  key={ft.type}
                  onClick={() => addField(ft.type)}
                  className={`flex items-center gap-3 px-3 py-3 text-sm rounded-lg border transition-colors text-left shadow-sm ${
                    ft.type === 'ticket' 
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' 
                      : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-100'
                  }`}
                >
                  {ft.icon ? <ft.icon className="w-5 h-5 opacity-70" /> : <Plus className="w-5 h-5 opacity-70" />}
                  <span className="font-medium">{ft.label}</span>
                </button>
              ))}
            </div>
            <div className="mt-8 p-4 bg-indigo-50 rounded-lg text-xs text-indigo-800 border border-indigo-100 hidden lg:block">
              <p className="font-bold mb-1">Tip:</p>
              <p>Click the gear icon on any field in the canvas to configure options and logic.</p>
            </div>
          </div>

          {/* Main Canvas - Editor */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col lg:overflow-hidden h-auto lg:h-full">
            <div className="p-4 border-b border-gray-100">
               <input 
                  type="text" 
                  className="text-lg font-bold text-gray-900 border-none focus:ring-0 w-full placeholder-gray-300"
                  value={form.title}
                  onChange={e => updateFormMetadata({ title: e.target.value })}
                  placeholder="Event Title"
                />
                <input 
                  type="text" 
                  className="text-sm text-gray-500 border-none focus:ring-0 w-full placeholder-gray-300"
                  value={form.description}
                  onChange={e => updateFormMetadata({ description: e.target.value })}
                  placeholder="Event Description"
                />
            </div>
            
            <div className="flex-1 lg:overflow-y-auto p-4 lg:p-8 bg-gray-50/50 min-h-[500px] lg:min-h-0">
              <div className="max-w-2xl mx-auto space-y-4 pb-20 lg:pb-0">
                {form.fields.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                    Select elements from the sidebar to build your form.
                  </div>
                ) : (
                  form.fields.map((field, index) => (
                    <div 
                      key={field.id}
                      className={`group relative bg-white p-6 rounded-xl border transition-all shadow-sm ${
                         field.type === 'ticket' ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-300'
                      }`}
                    >
                      {/* Field Header */}
                      <div className="flex justify-between items-start mb-2">
                         <div>
                            <div className="font-semibold text-gray-900">{field.label}</div>
                            <div className="text-xs text-gray-400 uppercase tracking-wider">{field.type}</div>
                         </div>
                         <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => moveField(index, 'up')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
                               <MoveUp className="w-4 h-4" />
                            </button>
                            <button onClick={() => moveField(index, 'down')} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
                               <MoveDown className="w-4 h-4" />
                            </button>
                            <div className="w-px h-4 bg-gray-200 mx-1"></div>
                            <button 
                               onClick={() => setEditingField(editingField?.id === field.id ? null : field)} 
                               className={`p-1.5 rounded transition ${editingField?.id === field.id ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'}`}
                            >
                               <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={() => removeField(field.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded">
                               <Trash2 className="w-4 h-4" />
                            </button>
                         </div>
                      </div>

                      {/* Editing Panel */}
                      {editingField?.id === field.id && (
                         <div className="mt-4 pt-4 border-t border-gray-200 space-y-4 animate-fade-in">
                            <div>
                               <label className="block text-xs font-bold text-gray-500 mb-1">Field Label</label>
                               <input 
                                 type="text" 
                                 className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                 value={editingField.label}
                                 onChange={e => setEditingField({...editingField, label: e.target.value})}
                               />
                            </div>
                            
                            {field.type !== 'ticket' && (
                               <div className="flex gap-4">
                                  <div className="flex-1">
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Placeholder</label>
                                    <input 
                                      type="text" 
                                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                      value={editingField.placeholder || ''}
                                      onChange={e => setEditingField({...editingField, placeholder: e.target.value})}
                                    />
                                  </div>
                                  <div className="flex items-center pt-5">
                                     <label className="flex items-center gap-2 cursor-pointer select-none">
                                        <input 
                                          type="checkbox" 
                                          checked={editingField.required}
                                          onChange={e => setEditingField({...editingField, required: e.target.checked})}
                                          className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm text-gray-700">Required</span>
                                     </label>
                                  </div>
                               </div>
                            )}

                            {['select', 'radio', 'checkbox'].includes(field.type) && (
                               <div>
                                  <label className="block text-xs font-bold text-gray-500 mb-1">Options (comma separated)</label>
                                  <input 
                                    type="text" 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                    value={editingField.options?.join(', ') || ''}
                                    onChange={e => setEditingField({...editingField, options: e.target.value.split(',').map(s => s.trim())})}
                                  />
                               </div>
                            )}

                            {/* Ticket Config Editor */}
                            {field.type === 'ticket' && editingField.ticketConfig && (
                               <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100 space-y-4">
                                  <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2">
                                     <Ticket className="w-4 h-4" /> Ticket Types
                                  </h4>
                                  <div className="space-y-2">
                                     {editingField.ticketConfig.items.map((item, i) => (
                                        <div key={item.id} className="grid grid-cols-12 gap-2 items-start">
                                            <div className="col-span-5">
                                               <input type="text" placeholder="Name" className="w-full text-xs p-2 rounded border" 
                                                 value={item.name} onChange={e => updateTicketItem(i, { name: e.target.value })} />
                                            </div>
                                            <div className="col-span-3">
                                               <input type="number" placeholder="Price" className="w-full text-xs p-2 rounded border" 
                                                 value={item.price} onChange={e => updateTicketItem(i, { price: parseFloat(e.target.value) })} />
                                            </div>
                                            <div className="col-span-3">
                                               <input type="number" placeholder="Qty" className="w-full text-xs p-2 rounded border" 
                                                 value={item.inventory} onChange={e => updateTicketItem(i, { inventory: parseInt(e.target.value) })} />
                                            </div>
                                            <div className="col-span-1 pt-1">
                                               <button onClick={() => deleteTicketItem(i)} className="text-red-500 hover:bg-red-100 p-1 rounded"><X className="w-3 h-3" /></button>
                                            </div>
                                        </div>
                                     ))}
                                     <button onClick={addTicketItem} className="text-xs text-indigo-600 font-medium hover:underline">+ Add Ticket Type</button>
                                  </div>
                                  
                                  <div className="border-t border-indigo-200 pt-3">
                                    <h4 className="text-sm font-bold text-indigo-900 mb-2">Promo Codes</h4>
                                    <div className="space-y-2">
                                       {editingField.ticketConfig.promoCodes.map((code, i) => (
                                          <div key={i} className="flex gap-2 items-center">
                                             <input type="text" className="w-24 text-xs p-2 rounded border" value={code.code} onChange={e => updatePromoCode(i, { code: e.target.value })} />
                                             <select className="text-xs p-2 rounded border" value={code.type} onChange={e => updatePromoCode(i, { type: e.target.value as any })}>
                                                <option value="percent">%</option>
                                                <option value="fixed">$</option>
                                             </select>
                                             <input type="number" className="w-16 text-xs p-2 rounded border" value={code.value} onChange={e => updatePromoCode(i, { value: parseFloat(e.target.value) })} />
                                             <button onClick={() => deletePromoCode(i)} className="text-red-500 hover:bg-red-100 p-1 rounded"><X className="w-3 h-3" /></button>
                                          </div>
                                       ))}
                                       <button onClick={addPromoCode} className="text-xs text-indigo-600 font-medium hover:underline">+ Add Promo Code</button>
                                    </div>
                                  </div>
                               </div>
                            )}

                            <div className="flex justify-end pt-2">
                               <button 
                                 onClick={() => saveFieldUpdates(editingField)}
                                 className="px-4 py-2 bg-gray-900 text-white text-xs rounded-md font-medium hover:bg-gray-800"
                               >
                                 Done
                               </button>
                            </div>
                         </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
         <div className="max-w-4xl mx-auto w-full p-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-6">
               <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Settings className="w-5 h-5" /> Form Settings
               </h3>
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Message</label>
                  <p className="text-xs text-gray-500 mb-2">Displayed after successful registration.</p>
                  <RichTextEditor 
                     value={form.thankYouMessage || ''} 
                     onChange={(val) => updateFormMetadata({ thankYouMessage: val })}
                     placeholder="Type your thank you message..."
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg max-w-xs" 
                     value={form.settings?.currency || 'USD'}
                     onChange={e => updateFormMetadata({ settings: { ...form.settings, currency: e.target.value } })}
                  />
               </div>
            </div>
         </div>
      )}

      {/* Preview Tab */}
      {activeTab === 'preview' && (
         <div className="flex-1 bg-gray-100 overflow-y-auto p-4 lg:p-8 flex justify-center">
            <div className="w-full max-w-xl bg-white rounded-xl shadow-lg overflow-hidden min-h-[400px]">
               {/* Preview Header */}
               <div className="bg-indigo-600 p-6">
                  <h2 className="text-2xl font-bold text-white">{form.title}</h2>
                  <p className="text-indigo-100 mt-1">{form.description}</p>
               </div>

               {/* Preview Content */}
               <div className="p-8">
                  {previewStep === 'form' && (
                     <form onSubmit={handlePreviewSubmit} className="space-y-6">
                        {previewError && (
                           <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" /> {previewError}
                           </div>
                        )}
                        {form.fields.map(field => isFieldVisibleInPreview(field) && (
                           <div key={field.id}>
                              {field.type !== 'ticket' && (
                                 <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                 </label>
                              )}
                              {/* Simple render for preview */}
                              {field.type === 'textarea' ? (
                                 <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg" rows={3}
                                    value={previewAnswers[field.id] || ''}
                                    onChange={e => setPreviewAnswers({...previewAnswers, [field.id]: e.target.value})}
                                 />
                              ) : field.type === 'ticket' ? (
                                 <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                    <h4 className="font-bold text-gray-900 mb-2">{field.label}</h4>
                                    {field.ticketConfig?.items.map(item => (
                                       <div key={item.id} className="flex justify-between items-center mb-2 last:mb-0">
                                          <span className="text-sm">{item.name} ({item.price} {field.ticketConfig?.currency})</span>
                                          <select className="border rounded p-1 text-sm" 
                                             value={previewTicketQuantities[item.id] || 0}
                                             onChange={e => setPreviewTicketQuantities({...previewTicketQuantities, [item.id]: parseInt(e.target.value)})}
                                          >
                                             {[...Array(item.maxPerOrder + 1)].map((_, i) => <option key={i} value={i}>{i}</option>)}
                                          </select>
                                       </div>
                                    ))}
                                    <div className="mt-4 pt-2 border-t flex justify-between font-bold text-indigo-700">
                                       <span>Total:</span>
                                       <span>{previewPaymentTotal} {field.ticketConfig?.currency}</span>
                                    </div>
                                 </div>
                              ) : (
                                 <input type={field.type === 'number' ? 'number' : 'text'} 
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                                    value={previewAnswers[field.id] || ''}
                                    onChange={e => setPreviewAnswers({...previewAnswers, [field.id]: e.target.value})}
                                 />
                              )}
                           </div>
                        ))}
                        <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold">
                           {previewPaymentTotal > 0 ? 'Proceed to Payment' : 'Submit Registration'}
                        </button>
                     </form>
                  )}

                  {previewStep === 'payment' && (
                     <div className="text-center py-8">
                        <CreditCard className="w-12 h-12 text-indigo-600 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-gray-900 mb-2">Payment Preview</h3>
                        <p className="text-gray-500 mb-6">Total due: {previewPaymentTotal} {form.fields.find(f => f.type === 'ticket')?.ticketConfig?.currency}</p>
                        <button onClick={finalizePreview} disabled={previewLoading} className="w-full py-3 bg-yellow-400 text-blue-900 font-bold rounded-lg flex justify-center items-center gap-2">
                           {previewLoading ? <Loader2 className="animate-spin" /> : 'Pay with PayPal'}
                        </button>
                        <button onClick={() => setPreviewStep('form')} className="mt-4 text-sm text-gray-500 underline">Back</button>
                     </div>
                  )}

                  {previewStep === 'success' && (
                     <div className="text-center py-8">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                           <Check className="w-8 h-8 text-green-600" />
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900 mb-2">Success!</h3>
                        <p className="text-gray-500 mb-6">Your test registration was successful.</p>
                        <button onClick={resetPreview} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium">Test Again</button>
                     </div>
                  )}
               </div>
            </div>
         </div>
      )}
    </div>
  );
};

export default FormBuilder;