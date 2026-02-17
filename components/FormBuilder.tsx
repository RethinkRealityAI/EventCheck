import React, { useState, useEffect } from 'react';
import { Plus, Trash2, MoveUp, MoveDown, Settings, Save, ArrowLeft, X, Ticket, MessageSquare, Layout, CreditCard, Tag, Eye, AlertCircle, ArrowRight, Check, FileText, Download, ChevronRight, ChevronLeft, MapPin, CheckSquare } from 'lucide-react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { FormField, FieldType, Form, PromoCode, TicketItem } from '../types';
import { getFormById, saveForm } from '../services/storageService';
import { useNotifications } from './NotificationSystem';
import RichTextEditor from './RichTextEditor';
import FormPreview from './FormPreview';

const FIELD_TYPES: { type: FieldType, label: string, icon?: any }[] = [
   { type: 'text', label: 'Short Text' },
   { type: 'textarea', label: 'Long Text' },
   { type: 'email', label: 'Email' },
   { type: 'phone', label: 'Phone' },
   { type: 'number', label: 'Number' },
   { type: 'address', label: 'Address', icon: MapPin },
   { type: 'boolean', label: 'Yes/No (Switch)', icon: CheckSquare },
   { type: 'select', label: 'Dropdown Selection' },
   { type: 'radio', label: 'Single Choice (Radio)' },
   { type: 'checkbox', label: 'Multiple Choice (Checkboxes)' },
   { type: 'ticket', label: 'Tickets & Payment', icon: Ticket },
];

const FormBuilder: React.FC = () => {
   const { formId } = useParams<{ formId: string }>();
   const navigate = useNavigate();
   const [form, setForm] = useState<Form | null>(null);
   const [editingField, setEditingField] = useState<FormField | null>(null);
   const [activeTab, setActiveTab] = useState<'editor' | 'settings' | 'preview'>('editor');
   const [settingsSubTab, setSettingsSubTab] = useState<'appearance' | 'success' | 'pdf'>('appearance');
   const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
   const [sidebarPinned, setSidebarPinned] = useState(true);


   const { showNotification } = useNotifications();

   useEffect(() => {
      if (formId) {
         const fetch = async () => {
            const existing = await getFormById(formId);
            if (existing) {
               setForm(existing);
            } else {
               navigate('/admin/forms');
            }
         };
         fetch();
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

   const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'logo') => {
      const file = e.target.files?.[0];
      if (!file || !form) return;

      const reader = new FileReader();
      reader.onloadend = () => {
         const base64String = reader.result as string;
         if (type === 'background') {
            updateFormMetadata({ settings: { ...form.settings, formBackgroundImage: base64String } });
         } else {
            updateFormMetadata({ pdfSettings: { ...form.pdfSettings, logoUrl: base64String } });
         }
         showNotification('Image uploaded successfully', 'success');
      };
      reader.readAsDataURL(file);
   };

   const updateFormMetadata = (updates: Partial<Form>) => {
      if (form) {
         setForm({ ...form, ...updates });
      }
   };

   const addField = (type: FieldType) => {
      if (!form) return;

      if (type === 'ticket' && form.fields.find(f => f.type === 'ticket')) {
         showNotification("You can only have one Ticket block per form.", 'warning');
         return;
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
            items: [
               { id: `tix_${Date.now()}`, name: 'General Admission', price: 10, inventory: 100, maxPerOrder: 5 }
            ],
            promoCodes: []
         } : undefined
      };

      // Initialize/Ensure settings defaults
      if (!form.settings) {
         updateFormMetadata({ settings: { currency: 'CAD', showQrOnSuccess: true, showTicketButtonOnSuccess: true } });
      }

      setForm({ ...form, fields: [...form.fields, newField] });
      setEditingField(newField);
      if (activeTab !== 'editor') setActiveTab('editor');
   };

   const removeField = (id: string) => {
      if (!form) return;
      if (confirm('Delete this field?')) {
         setForm({ ...form, fields: form.fields.filter(f => f.id !== id) });
         if (editingField?.id === id) setEditingField(null);
         showNotification('Field removed', 'info');
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



   // --- Ticket Helpers ---
   const addTicketItem = () => {
      if (!editingField?.ticketConfig) return;
      const newItem: TicketItem = {
         id: `tix_${Date.now()}`,
         name: 'New Ticket Type',
         price: 0,
         inventory: 100,
         maxPerOrder: 10,
         seats: 1
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



   if (!form) return <div className="p-8">Loading...</div>;

   return (
      <div className="flex flex-col lg:h-[calc(100vh-48px)] relative h-auto w-full">
         {/* Top Header */}
         <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-5 rounded-2xl border border-gray-200 shadow-sm gap-4 mb-3 flex-shrink-0 sticky top-0 z-20 lg:static">
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

         <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:overflow-hidden h-auto lg:h-full">
            {activeTab === 'editor' && (
               <>
                  {/* Sidebar - Field Types - Collapsible */}
                  <div
                     className={`bg-white p-6 rounded-2xl border border-gray-200 shadow-sm flex-shrink-0 lg:h-full h-auto lg:overflow-y-auto custom-scrollbar transition-all duration-300 ease-in-out z-10 ${sidebarCollapsed && !sidebarPinned ? 'w-full lg:w-20' : 'w-full lg:w-80'}`}
                     onMouseEnter={() => !sidebarPinned && setSidebarCollapsed(false)}
                     onMouseLeave={() => !sidebarPinned && setSidebarCollapsed(true)}
                  >
                     <div className={`flex items-center mb-4 ${sidebarCollapsed && !sidebarPinned ? 'justify-center' : 'justify-between'}`}>
                        <h3 className={`font-semibold text-gray-700 flex items-center gap-2 ${sidebarCollapsed && !sidebarPinned ? 'justify-center lg:justify-center' : ''}`}>
                           <Layout className="w-5 h-5 text-indigo-600" />
                           <span className={`${sidebarCollapsed && !sidebarPinned ? 'lg:hidden' : 'block'}`}>Add Elements</span>
                        </h3>
                        <button
                           onClick={() => setSidebarPinned(!sidebarPinned)}
                           className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all hidden lg:flex ${sidebarPinned
                              ? 'bg-indigo-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600'
                              } ${sidebarCollapsed && !sidebarPinned ? 'hidden' : ''}`}
                           title={sidebarPinned ? "Unpin Sidebar" : "Pin Sidebar"}
                        >
                           <span className="text-[10px] font-bold uppercase tracking-tight">{sidebarPinned ? 'Pinned' : 'Pin'}</span>
                           {sidebarPinned ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </button>
                     </div>

                     <div className={`grid gap-2 ${sidebarCollapsed && !sidebarPinned ? 'grid-cols-2 lg:grid-cols-1' : 'grid-cols-2 lg:grid-cols-1'}`}>
                        {FIELD_TYPES.map(ft => (
                           <button
                              key={ft.type}
                              onClick={() => addField(ft.type)}
                              className={`flex items-center gap-3 px-3 py-3 text-sm rounded-lg border transition-colors text-left shadow-sm relative group ${ft.type === 'ticket'
                                 ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                                 : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border-gray-100'
                                 } ${sidebarCollapsed && !sidebarPinned ? 'justify-center' : ''}`}
                              title={sidebarCollapsed && !sidebarPinned ? ft.label : ''}
                           >
                              {ft.icon ? <ft.icon className="w-5 h-5 opacity-70 flex-shrink-0" /> : <Plus className="w-5 h-5 opacity-70 flex-shrink-0" />}
                              <span className={`font-medium truncate transition-all duration-200 ${sidebarCollapsed && !sidebarPinned ? 'lg:w-0 lg:opacity-0 lg:absolute' : 'w-auto opacity-100'}`}>
                                 {ft.label}
                              </span>
                              {/* Tooltip for collapsed state */}
                              {sidebarCollapsed && !sidebarPinned && (
                                 <span className="hidden lg:group-hover:block absolute left-full top-1/2 -translate-y-1/2 ml-2 bg-gray-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-50">
                                    {ft.label}
                                 </span>
                              )}
                           </button>
                        ))}
                     </div>
                  </div>

                  {/* Main Canvas - Editor */}
                  <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col lg:overflow-hidden h-auto lg:h-full">
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

                     <div className="flex-1 lg:overflow-y-auto p-6 lg:p-10 bg-gray-50/50 min-h-[500px] lg:min-h-0 custom-scrollbar">
                        <div className="max-w-4xl mx-auto space-y-6 pb-20 lg:pb-0">
                           {form.fields.length === 0 ? (
                              <div className="text-center py-12 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                                 Select elements from the sidebar to build your form.
                              </div>
                           ) : (
                              form.fields.map((field, index) => (
                                 <div
                                    key={field.id}
                                    className={`group relative bg-white p-6 rounded-xl border transition-all shadow-sm ${field.type === 'ticket' ? 'border-indigo-200 bg-indigo-50/30' : 'border-gray-200 hover:border-indigo-300'
                                       }`}
                                 >
                                    {/* Field Header */}
                                    <div className="flex justify-between items-start mb-2">
                                       <div>
                                          <div className="font-semibold text-gray-900">{field.label}</div>
                                          <div className="text-[10px] text-gray-400 uppercase tracking-widest font-mono">ID: {field.id}</div>
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

                                    {/* Visual Representation */}
                                    <div className="mb-4">
                                       {field.type === 'textarea' ? (
                                          <div className="w-full h-16 border border-gray-100 rounded-lg bg-gray-50 flex items-center px-4 text-gray-400 text-xs italic">
                                             Long text area content...
                                          </div>
                                       ) : ['text', 'email', 'phone', 'number', 'address'].includes(field.type) ? (
                                          <div className="w-full h-10 border border-gray-100 rounded-lg bg-gray-50 flex items-center px-4 text-gray-400 text-xs italic">
                                             {field.placeholder || (field.type === 'text' && field.validation === 'int' ? '0' : `${FIELD_TYPES.find(t => t.type === field.type)?.label}...`)}
                                             {field.type === 'text' && field.validation === 'int' && <span className="ml-auto text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded not-italic font-bold">INT</span>}
                                          </div>
                                       ) : field.type === 'boolean' ? (
                                          <div className="flex items-center gap-3 p-3 border border-gray-100 rounded-lg bg-gray-50">
                                             <div className="w-10 h-5 bg-gray-200 rounded-full relative">
                                                <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                             </div>
                                             <span className="text-xs text-gray-400">Toggle Switch</span>
                                          </div>
                                       ) : ['select', 'radio', 'checkbox'].includes(field.type) ? (
                                          <div className="space-y-1.5">
                                             {(field.options || []).slice(0, 3).map((opt, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs text-gray-400 overflow-hidden">
                                                   <div className={`w-3.5 h-3.5 border border-gray-200 flex-shrink-0 ${field.type === 'radio' ? 'rounded-full' : 'rounded'}`}></div>
                                                   <span className="truncate">{opt}</span>
                                                </div>
                                             ))}
                                             {(field.options || []).length > 3 && (
                                                <div className="text-[10px] text-gray-300 italic pl-5">+ {(field.options || []).length - 3} more...</div>
                                             )}
                                          </div>
                                       ) : field.type === 'ticket' ? (
                                          <div className="space-y-2">
                                             {field.ticketConfig?.items.slice(0, 2).map((item, i) => (
                                                <div key={i} className="flex justify-between items-center p-2 border border-indigo-100 rounded bg-indigo-50/50">
                                                   <span className="text-xs font-medium text-indigo-700">{item.name}</span>
                                                   <span className="text-[10px] text-indigo-500 font-bold">{item.price} {field.ticketConfig?.currency}</span>
                                                </div>
                                             ))}
                                             {field.ticketConfig && field.ticketConfig.items.length > 2 && (
                                                <div className="text-[10px] text-indigo-300 italic">+ {field.ticketConfig.items.length - 2} more ticket types...</div>
                                             )}
                                          </div>
                                       ) : null}
                                    </div>

                                    <div className="flex items-center gap-2 mb-4">
                                       <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-bold rounded uppercase tracking-wider">
                                          {FIELD_TYPES.find(t => t.type === field.type)?.label || field.type}
                                       </span>
                                       {field.required && (
                                          <span className="px-2 py-0.5 bg-red-50 text-red-500 text-[10px] font-bold rounded uppercase tracking-wider">Required</span>
                                       )}
                                       {field.conditional?.enabled && (
                                          <span className="px-2 py-0.5 bg-amber-50 text-amber-600 text-[10px] font-bold rounded uppercase tracking-wider flex items-center gap-1">
                                             <span className="w-1.5 h-1.5 bg-amber-400 rounded-full"></span> Conditional
                                          </span>
                                       )}
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
                                                onChange={e => setEditingField({ ...editingField, label: e.target.value })}
                                             />
                                          </div>

                                          {field.type !== 'ticket' && (
                                             <div className="space-y-4">
                                                <div className="flex gap-4">
                                                   <div className="flex-1">
                                                      <label className="block text-xs font-bold text-gray-500 mb-1">Placeholder</label>
                                                      <input
                                                         type="text"
                                                         className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                                         value={editingField.placeholder || ''}
                                                         onChange={e => setEditingField({ ...editingField, placeholder: e.target.value })}
                                                      />
                                                   </div>
                                                   <div className="flex items-center pt-5">
                                                      <label className="flex items-center gap-2 cursor-pointer select-none">
                                                         <input
                                                            type="checkbox"
                                                            checked={editingField.required}
                                                            onChange={e => setEditingField({ ...editingField, required: e.target.checked })}
                                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                                         />
                                                         <span className="text-sm text-gray-700">Required</span>
                                                      </label>
                                                   </div>
                                                </div>

                                                {field.type === 'text' && (
                                                   <div>
                                                      <label className="block text-xs font-bold text-gray-500 mb-1">Input Validation</label>
                                                      <select
                                                         className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                                                         value={editingField.validation || 'string'}
                                                         onChange={e => setEditingField({ ...editingField, validation: e.target.value as 'string' | 'int' })}
                                                      >
                                                         <option value="string">Any Text (String)</option>
                                                         <option value="int">Whole Numbers Only (Integer)</option>
                                                      </select>
                                                   </div>
                                                )}
                                             </div>
                                          )}

                                          {['select', 'radio', 'checkbox'].includes(field.type) && (
                                             <div className="space-y-2">
                                                <label className="block text-xs font-bold text-gray-500 mb-1">Options</label>
                                                <div className="space-y-2">
                                                   {(editingField.options || []).map((option, optIdx) => (
                                                      <div key={optIdx} className="flex gap-2">
                                                         <input
                                                            type="text"
                                                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                                                            value={option}
                                                            onChange={e => {
                                                               const newOptions = [...(editingField.options || [])];
                                                               newOptions[optIdx] = e.target.value;
                                                               setEditingField({ ...editingField, options: newOptions });
                                                            }}
                                                            placeholder={`Option ${optIdx + 1}`}
                                                         />
                                                         <button
                                                            onClick={() => {
                                                               const newOptions = (editingField.options || []).filter((_, i) => i !== optIdx);
                                                               setEditingField({ ...editingField, options: newOptions });
                                                            }}
                                                            className="p-2 text-gray-400 hover:text-red-500 transition"
                                                         >
                                                            <X className="w-4 h-4" />
                                                         </button>
                                                      </div>
                                                   ))}
                                                   <button
                                                      onClick={() => {
                                                         const newOptions = [...(editingField.options || []), `Option ${(editingField.options || []).length + 1}`];
                                                         setEditingField({ ...editingField, options: newOptions });
                                                      }}
                                                      className="text-xs text-indigo-600 font-bold hover:text-indigo-700 flex items-center gap-1 mt-1"
                                                   >
                                                      <Plus className="w-3 h-3" /> Add Option
                                                   </button>
                                                </div>
                                             </div>
                                          )}

                                          {/* Conditional Logic Section */}
                                          <div className="pt-4 border-t border-gray-100">
                                             <div className="flex items-center justify-between mb-4">
                                                <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                   <Layout className="w-4 h-4 text-indigo-600" /> Conditional Visibility
                                                </label>
                                                <div
                                                   className={`w-10 h-5 rounded-full relative cursor-pointer transition-colors ${editingField.conditional?.enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                                   onClick={() => setEditingField({
                                                      ...editingField,
                                                      conditional: {
                                                         enabled: !editingField.conditional?.enabled,
                                                         fieldId: editingField.conditional?.fieldId || '',
                                                         value: editingField.conditional?.value || ''
                                                      }
                                                   })}
                                                >
                                                   <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${editingField.conditional?.enabled ? 'translate-x-5' : ''}`}></div>
                                                </div>
                                             </div>

                                             {editingField.conditional?.enabled && (
                                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4 animate-in slide-in-from-top-2 duration-200">
                                                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                      <div>
                                                         <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Show if question...</label>
                                                         <select
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                            value={editingField.conditional?.fieldId}
                                                            onChange={e => setEditingField({
                                                               ...editingField,
                                                               conditional: { ...editingField.conditional!, fieldId: e.target.value, value: '' }
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

                                                      <div>
                                                         <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Equals...</label>
                                                         {(() => {
                                                            const targetField = form.fields.find(f => f.id === editingField.conditional?.fieldId);
                                                            if (targetField && (targetField.options?.length || 0) > 0) {
                                                               return (
                                                                  <select
                                                                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                                     value={editingField.conditional?.value}
                                                                     onChange={e => {
                                                                        const val = e.target.value;
                                                                        setEditingField({
                                                                           ...editingField,
                                                                           conditional: { ...editingField.conditional!, value: val }
                                                                        });
                                                                     }}
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
                                                                     className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                                     value={editingField.conditional?.value}
                                                                     onChange={e => setEditingField({
                                                                        ...editingField,
                                                                        conditional: { ...editingField.conditional!, value: e.target.value }
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
                                                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                                                  placeholder="Enter value"
                                                                  value={editingField.conditional?.value || ''}
                                                                  onChange={e => setEditingField({
                                                                     ...editingField,
                                                                     conditional: { ...editingField.conditional!, value: e.target.value }
                                                                  })}
                                                               />
                                                            );
                                                         })()}
                                                      </div>
                                                   </div>
                                                   <p className="text-[10px] text-gray-400 italic">
                                                      This question will only be visible if the selected question matches the specified value.
                                                   </p>
                                                </div>
                                             )}
                                          </div>

                                          {/* Ticket Config Editor */}
                                          {field.type === 'ticket' && editingField.ticketConfig && (
                                             <div className="bg-indigo-50/50 p-6 rounded-xl border border-indigo-100 space-y-6">
                                                <div>
                                                   <h4 className="text-sm font-bold text-indigo-900 flex items-center gap-2 mb-4">
                                                      <Ticket className="w-4 h-4" /> Ticket Types
                                                   </h4>
                                                   <div className="space-y-3">
                                                      {(editingField.ticketConfig.items || []).map((item, i) => (
                                                         <div key={item.id} className="relative bg-white p-4 rounded-lg border border-indigo-100 shadow-sm animate-in fade-in duration-200">
                                                            <button
                                                               onClick={() => deleteTicketItem(i)}
                                                               className="absolute -top-2 -right-2 w-6 h-6 bg-red-50 text-red-500 rounded-full flex items-center justify-center border border-red-100 hover:bg-red-500 hover:text-white transition"
                                                            >
                                                               <X className="w-3 h-3" />
                                                            </button>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                               <div className="space-y-4">
                                                                  <div>
                                                                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Name</label>
                                                                     <input type="text" placeholder="General Admission" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                        value={item.name} onChange={e => updateTicketItem(i, { name: e.target.value })} />
                                                                  </div>
                                                                  <div className="grid grid-cols-2 gap-2">
                                                                     <div>
                                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Seats / Table</label>
                                                                        <input type="number" placeholder="1" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                           value={item.seats || 1} onChange={e => updateTicketItem(i, { seats: parseInt(e.target.value) })} />
                                                                     </div>
                                                                     <div>
                                                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Max / Order</label>
                                                                        <input type="number" placeholder="5" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                           value={item.maxPerOrder} onChange={e => updateTicketItem(i, { maxPerOrder: parseInt(e.target.value) })} />
                                                                     </div>
                                                                  </div>
                                                               </div>
                                                               <div className="grid grid-cols-2 gap-2 h-fit">
                                                                  <div>
                                                                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Price</label>
                                                                     <input type="number" placeholder="0" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                        value={item.price} onChange={e => updateTicketItem(i, { price: parseFloat(e.target.value) })} />
                                                                  </div>
                                                                  <div>
                                                                     <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Inventory</label>
                                                                     <input type="number" placeholder="100" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                        value={item.inventory} onChange={e => updateTicketItem(i, { inventory: parseInt(e.target.value) })} />
                                                                  </div>
                                                               </div>
                                                            </div>
                                                         </div>
                                                      ))}
                                                      <button onClick={addTicketItem} className="w-full py-2 border-2 border-dashed border-indigo-200 rounded-lg text-xs text-indigo-600 font-bold hover:bg-indigo-100/50 transition flex items-center justify-center gap-1">
                                                         <Plus className="w-3 h-3" /> Add Ticket Type
                                                      </button>
                                                   </div>
                                                </div>

                                                <div className="pt-6 border-t border-indigo-100">
                                                   <h4 className="text-sm font-bold text-indigo-900 mb-4 flex items-center gap-2">
                                                      <Tag className="w-4 h-4" /> Promo Codes
                                                   </h4>
                                                   <div className="space-y-3">
                                                      {(editingField.ticketConfig.promoCodes || []).map((code, i) => (
                                                         <div key={i} className="relative bg-white p-4 rounded-lg border border-indigo-100 shadow-sm animate-in fade-in duration-200 flex items-end gap-3">
                                                            <div className="flex-1">
                                                               <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Code</label>
                                                               <input type="text" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                  value={code.code} onChange={e => updatePromoCode(i, { code: e.target.value })} placeholder="SAVE10" />
                                                            </div>
                                                            <div className="w-20">
                                                               <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Type</label>
                                                               <select className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition bg-white"
                                                                  value={code.type} onChange={e => updatePromoCode(i, { type: e.target.value as any })}>
                                                                  <option value="percent">% Off</option>
                                                                  <option value="fixed">$ Off</option>
                                                               </select>
                                                            </div>
                                                            <div className="w-24">
                                                               <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Value</label>
                                                               <input type="number" className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                                  value={code.value} onChange={e => updatePromoCode(i, { value: parseFloat(e.target.value) })} />
                                                            </div>
                                                            <button
                                                               onClick={() => deletePromoCode(i)}
                                                               className="p-2 text-gray-400 hover:text-red-500 transition"
                                                            >
                                                               <Trash2 className="w-4 h-4" />
                                                            </button>
                                                         </div>
                                                      ))}
                                                      <button onClick={addPromoCode} className="w-full py-2 border-2 border-dashed border-indigo-200 rounded-lg text-xs text-indigo-600 font-bold hover:bg-indigo-100/50 transition flex items-center justify-center gap-1">
                                                         <Plus className="w-3 h-3" /> Add Promo Code
                                                      </button>
                                                   </div>
                                                </div>

                                                <div className="pt-6 border-t border-indigo-100 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                   <label className="flex items-center gap-3 p-3 bg-white border border-indigo-100 rounded-lg cursor-pointer hover:border-indigo-300 transition shadow-sm">
                                                      <input
                                                         type="checkbox"
                                                         className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                                         checked={editingField.ticketConfig.enableDonations || false}
                                                         onChange={e => setEditingField({
                                                            ...editingField,
                                                            ticketConfig: { ...editingField.ticketConfig!, enableDonations: e.target.checked }
                                                         })}
                                                      />
                                                      <div>
                                                         <span className="block text-sm font-bold text-gray-900">Enable Donations</span>
                                                         <span className="block text-xs text-gray-500">Allow users to donate extra.</span>
                                                      </div>
                                                   </label>
                                                   <label className="flex items-center gap-3 p-3 bg-white border border-indigo-100 rounded-lg cursor-pointer hover:border-indigo-300 transition shadow-sm">
                                                      <input
                                                         type="checkbox"
                                                         className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                                                         checked={editingField.ticketConfig.enableGuestDetails || false}
                                                         onChange={e => setEditingField({
                                                            ...editingField,
                                                            ticketConfig: { ...editingField.ticketConfig!, enableGuestDetails: e.target.checked }
                                                         })}
                                                      />
                                                      <div>
                                                         <span className="block text-sm font-bold text-gray-900">Guest Details</span>
                                                         <span className="block text-xs text-gray-500">Collect info for each guest.</span>
                                                      </div>
                                                   </label>
                                                </div>

                                                {editingField.ticketConfig.enableDonations && (
                                                   <div className="pt-4 border-t border-indigo-100 animate-in slide-in-from-top-2 duration-300 space-y-4">
                                                      <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-widest flex items-center gap-2">
                                                         <Settings className="w-3 h-3" /> Donation Settings
                                                      </h5>
                                                      <div>
                                                         <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Section Title</label>
                                                         <input
                                                            type="text"
                                                            className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                            placeholder="Donate Extra Seats"
                                                            value={editingField.ticketConfig.donationSectionTitle || ''}
                                                            onChange={e => setEditingField({
                                                               ...editingField,
                                                               ticketConfig: { ...editingField.ticketConfig!, donationSectionTitle: e.target.value }
                                                            })}
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Description / Prompt</label>
                                                         <input
                                                            type="text"
                                                            className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                            placeholder="Are you donating any seats at this table?"
                                                            value={editingField.ticketConfig.donationSectionDescription || ''}
                                                            onChange={e => setEditingField({
                                                               ...editingField,
                                                               ticketConfig: { ...editingField.ticketConfig!, donationSectionDescription: e.target.value }
                                                            })}
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Question Label</label>
                                                         <input
                                                            type="text"
                                                            className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                            placeholder="How many seats would you like to donate?"
                                                            value={editingField.ticketConfig.donationQuestionLabel || ''}
                                                            onChange={e => setEditingField({
                                                               ...editingField,
                                                               ticketConfig: { ...editingField.ticketConfig!, donationQuestionLabel: e.target.value }
                                                            })}
                                                         />
                                                      </div>
                                                      <div>
                                                         <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Help Text</label>
                                                         <input
                                                            type="text"
                                                            className="w-full text-xs p-2 rounded border border-gray-200 outline-none focus:ring-1 focus:ring-indigo-500 transition"
                                                            placeholder="These seats will be made available for individuals who may not otherwise be able to attend."
                                                            value={editingField.ticketConfig.donationHelpText || ''}
                                                            onChange={e => setEditingField({
                                                               ...editingField,
                                                               ticketConfig: { ...editingField.ticketConfig!, donationHelpText: e.target.value }
                                                            })}
                                                         />
                                                      </div>
                                                   </div>
                                                )}
                                             </div>
                                          )}

                                          <div className="flex justify-end pt-2">
                                             <button
                                                onClick={() => setEditingField(null)}
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
               </>
            )}

            {activeTab === 'settings' && (
               <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50/30">
                  <div className="max-w-7xl mx-auto w-full p-4 lg:p-6 pb-20">
                     <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-6 animate-fade-in">
                        <div className="border-b border-gray-100 pb-6">
                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                              <div>
                                 <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                    <Settings className="w-6 h-6 text-indigo-600" /> Form Configuration
                                 </h3>
                                 <p className="text-gray-500 mt-1 pl-8">Customize how your form looks and behaves.</p>
                              </div>

                              <div className="flex bg-gray-100 p-1 rounded-xl">
                                 <button
                                    onClick={() => setSettingsSubTab('appearance')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${settingsSubTab === 'appearance' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                 >
                                    <Layout className="w-4 h-4" /> Appearance
                                 </button>
                                 <button
                                    onClick={() => setSettingsSubTab('success')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${settingsSubTab === 'success' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                 >
                                    <Check className="w-4 h-4" /> Success Page
                                 </button>
                                 <button
                                    onClick={() => setSettingsSubTab('pdf')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${settingsSubTab === 'pdf' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                 >
                                    <FileText className="w-4 h-4" /> PDF Ticket
                                 </button>
                              </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                           {/* Left Column: Inputs */}
                           <div className="space-y-8">
                              {settingsSubTab === 'appearance' && (
                                 <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                                    <div>
                                       <h4 className="text-lg font-bold text-gray-900 mb-4">Registration Form Visuals</h4>
                                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                          <div>
                                             <label className="block text-xs font-bold text-gray-700 mb-1.5">Form Header Color</label>
                                             <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                   value={form.settings?.formHeaderColor || '#4F46E5'}
                                                   onChange={e => updateFormMetadata({ settings: { ...form.settings, formHeaderColor: e.target.value } })} />
                                                <span className="text-xs font-mono font-bold text-gray-600">{form.settings?.formHeaderColor || '#4F46E5'}</span>
                                             </div>
                                          </div>
                                          <div>
                                             <label className="block text-xs font-bold text-gray-700 mb-1.5">Accent Color (Buttons)</label>
                                             <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                   value={form.settings?.formAccentColor || '#4F46E5'}
                                                   onChange={e => updateFormMetadata({ settings: { ...form.settings, formAccentColor: e.target.value } })} />
                                                <span className="text-xs font-mono font-bold text-gray-600">{form.settings?.formAccentColor || '#4F46E5'}</span>
                                             </div>
                                          </div>
                                          <div>
                                             <label className="block text-xs font-bold text-gray-700 mb-1.5">Background Color</label>
                                             <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                   value={form.settings?.formBackgroundColor || '#F3F4F6'}
                                                   onChange={e => updateFormMetadata({ settings: { ...form.settings, formBackgroundColor: e.target.value } })} />
                                                <span className="text-xs font-mono font-bold text-gray-600">{form.settings?.formBackgroundColor || '#F3F4F6'}</span>
                                             </div>
                                          </div>
                                          <div>
                                             <label className="block text-xs font-bold text-gray-700 mb-1.5">Title Text Color</label>
                                             <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                   value={form.settings?.formTitleColor || '#FFFFFF'}
                                                   onChange={e => updateFormMetadata({ settings: { ...form.settings, formTitleColor: e.target.value } })} />
                                                <span className="text-xs font-mono font-bold text-gray-600">{form.settings?.formTitleColor || '#FFFFFF'}</span>
                                             </div>
                                          </div>
                                       </div>
                                    </div>

                                    <div>
                                       <h4 className="text-lg font-bold text-gray-900 mb-4">Form Text Customization</h4>
                                       <div className="grid grid-cols-1 gap-4">
                                          <div>
                                             <label className="block text-sm font-bold text-gray-700 mb-2">Form Title (Override)</label>
                                             <input
                                                type="text"
                                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                placeholder={form.title}
                                                value={form.settings?.formTitle || ''}
                                                onChange={e => updateFormMetadata({ settings: { ...form.settings, formTitle: e.target.value } })}
                                             />
                                             <p className="text-xs text-gray-500 mt-1 italic">Leave blank to use the default form title</p>
                                          </div>
                                          <div>
                                             <label className="block text-sm font-bold text-gray-700 mb-2">Submit Button Text</label>
                                             <input
                                                type="text"
                                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                placeholder="Register Now"
                                                value={form.settings?.submitButtonText || ''}
                                                onChange={e => updateFormMetadata({ settings: { ...form.settings, submitButtonText: e.target.value } })}
                                             />
                                             <p className="text-xs text-gray-500 mt-1 italic">Customize the text on the submit button (default: "Register Now")</p>
                                          </div>
                                       </div>
                                    </div>

                                    <div>
                                       <label className="block text-sm font-bold text-gray-700 mb-2">Background Image</label>
                                       <div className="flex items-center gap-3">
                                          {form.settings?.formBackgroundImage ? (
                                             <div className="relative group">
                                                <img src={form.settings.formBackgroundImage} alt="Background" className="w-24 h-14 object-cover rounded-lg border border-indigo-100 shadow-sm" />
                                                <button
                                                   onClick={() => updateFormMetadata({ settings: { ...form.settings, formBackgroundImage: undefined } })}
                                                   className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-lg"
                                                >
                                                   <X className="w-2.5 h-2.5" />
                                                </button>
                                             </div>
                                          ) : (
                                             <label className="w-24 h-14 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition group">
                                                <Plus className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                                                <span className="text-[9px] font-bold text-gray-400 group-hover:text-indigo-500 mt-0.5 uppercase">Upload</span>
                                                <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'background')} />
                                             </label>
                                          )}
                                          <div className="flex-1">
                                             <p className="text-xs text-gray-500 leading-relaxed italic">
                                                Upload a high-resolution image to be used as the background for your registration page. Recommended size: 1920x1080px.
                                             </p>
                                          </div>
                                       </div>
                                    </div>

                                    <div>
                                       <label className="block text-sm font-bold text-gray-700 mb-2">Base Currency & Pricing</label>
                                       <div className="grid grid-cols-2 gap-4">
                                          <div className="relative">
                                             <input type="text" className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                placeholder="USD"
                                                value={form.settings?.currency || 'USD'}
                                                onChange={e => updateFormMetadata({ settings: { ...form.settings, currency: e.target.value } })}
                                             />
                                             <CreditCard className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              )}

                              {settingsSubTab === 'success' && (
                                 <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                                    <div className="grid grid-cols-1 gap-6">
                                       <div>
                                          <label className="block text-sm font-bold text-gray-700 mb-2">Success Title</label>
                                          <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                             placeholder="Registration Confirmed!"
                                             value={form.settings?.successTitle || ''}
                                             onChange={e => updateFormMetadata({ settings: { ...form.settings, successTitle: e.target.value } })}
                                          />
                                       </div>

                                       <div>
                                          <label className="block text-sm font-bold text-gray-700 mb-2">Success Theme Colors</label>
                                          <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border">
                                             <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Header BG</label>
                                                <div className="flex items-center gap-2">
                                                   <input type="color" className="w-7 h-7 rounded border-none cursor-pointer p-0 bg-transparent"
                                                      value={form.settings?.successHeaderColor || '#4F46E5'}
                                                      onChange={e => updateFormMetadata({ settings: { ...form.settings, successHeaderColor: e.target.value } })} />
                                                   <span className="text-[10px] font-mono font-bold">{form.settings?.successHeaderColor || '#4F46E5'}</span>
                                                </div>
                                             </div>
                                             <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Icon/Check</label>
                                                <div className="flex items-center gap-2">
                                                   <input type="color" className="w-7 h-7 rounded border-none cursor-pointer p-0 bg-transparent"
                                                      value={form.settings?.successIconColor || '#10B981'}
                                                      onChange={e => updateFormMetadata({ settings: { ...form.settings, successIconColor: e.target.value } })} />
                                                   <span className="text-[10px] font-mono font-bold">{form.settings?.successIconColor || '#10B981'}</span>
                                                </div>
                                             </div>
                                             <div>
                                                <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">Card Accent</label>
                                                <div className="flex items-center gap-2">
                                                   <input type="color" className="w-7 h-7 rounded border-none cursor-pointer p-0 bg-transparent"
                                                      value={form.settings?.successFooterColor || '#F9FAFB'}
                                                      onChange={e => updateFormMetadata({ settings: { ...form.settings, successFooterColor: e.target.value } })} />
                                                   <span className="text-[10px] font-mono font-bold">{form.settings?.successFooterColor || '#F9FAFB'}</span>
                                                </div>
                                             </div>
                                          </div>
                                       </div>

                                       <div>
                                          <label className="block text-sm font-bold text-gray-700 mb-2">Success Page Elements</label>
                                          <div className="bg-gray-50 rounded-xl p-6 space-y-4 border border-gray-200">
                                             <label className="flex items-center justify-between cursor-pointer group">
                                                <div className="flex flex-col">
                                                   <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition">Show QR Code Card</span>
                                                   <span className="text-xs text-gray-500">Provide a digital check-in card immediately after registration.</span>
                                                </div>
                                                <div
                                                   className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${form.settings?.showQrOnSuccess !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                                   onClick={() => updateFormMetadata({ settings: { ...form.settings, showQrOnSuccess: !(form.settings?.showQrOnSuccess !== false) } })}
                                                >
                                                   <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${form.settings?.showQrOnSuccess !== false ? 'translate-x-6' : ''}`}></div>
                                                </div>
                                             </label>
                                             <hr className="border-gray-200" />
                                             <label className="flex items-center justify-between cursor-pointer group">
                                                <div className="flex flex-col">
                                                   <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition">Show 'Download Ticket' Button</span>
                                                   <span className="text-xs text-gray-500">Allow users to download their official PDF ticket to their device.</span>
                                                </div>
                                                <div
                                                   className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${form.settings?.showTicketButtonOnSuccess !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                                   onClick={() => updateFormMetadata({ settings: { ...form.settings, showTicketButtonOnSuccess: !(form.settings?.showTicketButtonOnSuccess !== false) } })}
                                                >
                                                   <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${form.settings?.showTicketButtonOnSuccess !== false ? 'translate-x-6' : ''}`}></div>
                                                </div>
                                             </label>
                                          </div>
                                       </div>

                                       <div>
                                          <label className="block text-sm font-bold text-gray-700 mb-2">Custom Thank You Message</label>
                                          <RichTextEditor
                                             value={form.thankYouMessage || ''}
                                             onChange={(val) => updateFormMetadata({ thankYouMessage: val })}
                                             placeholder="e.g. Thanks for registering! We look forward to seeing you."
                                          />
                                       </div>
                                    </div>
                                 </div>
                              )}

                              {settingsSubTab === 'pdf' && (
                                 <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                                    <div>
                                       <h4 className="text-lg font-bold text-gray-900 mb-4">PDF Ticket Overrides</h4>
                                       <p className="text-sm text-gray-500 mb-6 bg-indigo-50 p-4 rounded-xl border border-indigo-100 flex items-start gap-3">
                                          <AlertCircle className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                                          These settings will override the global organization settings only for this specific form's tickets.
                                       </p>

                                       <div className="grid grid-cols-1 gap-6">
                                          <div className="grid grid-cols-2 gap-4">
                                             <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Event Title (on PDF)</label>
                                                <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                   placeholder={form.title}
                                                   value={form.pdfSettings?.eventTitle || ''}
                                                   onChange={e => updateFormMetadata({ pdfSettings: { ...form.pdfSettings, eventTitle: e.target.value } })}
                                                />
                                             </div>
                                             <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Primary Color</label>
                                                <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                   <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                      value={form.pdfSettings?.primaryColor || '#4F46E5'}
                                                      onChange={e => updateFormMetadata({ pdfSettings: { ...form.pdfSettings, primaryColor: e.target.value } })} />
                                                   <span className="text-xs font-mono font-bold text-gray-600">{form.pdfSettings?.primaryColor || '#4F46E5'}</span>
                                                </div>
                                             </div>
                                          </div>

                                          <div className="grid grid-cols-2 gap-4">
                                             <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Organization Name</label>
                                                <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                   placeholder="My Awesome Org"
                                                   value={form.pdfSettings?.organizationName || ''}
                                                   onChange={e => updateFormMetadata({ pdfSettings: { ...form.pdfSettings, organizationName: e.target.value } })}
                                                />
                                             </div>
                                             <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Custom Logo</label>
                                                <div className="flex items-center gap-4">
                                                   {form.pdfSettings?.logoUrl ? (
                                                      <div className="relative group">
                                                         <img src={form.pdfSettings.logoUrl} className="w-12 h-12 object-contain rounded-lg border border-indigo-100 shadow-sm p-1" alt="Logo" />
                                                         <button
                                                            onClick={() => updateFormMetadata({ pdfSettings: { ...form.pdfSettings, logoUrl: undefined } })}
                                                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-lg"
                                                         >
                                                            <X className="w-2.5 h-2.5" />
                                                         </button>
                                                      </div>
                                                   ) : (
                                                      <label className="w-12 h-12 border border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition group">
                                                         <Plus className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                                                         <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'logo')} />
                                                      </label>
                                                   )}
                                                   <p className="text-[10px] text-gray-400 italic">Square or horizontal logo. PNG/JPG.</p>
                                                </div>
                                             </div>
                                          </div>

                                          <div>
                                             <label className="block text-sm font-bold text-gray-700 mb-2">Footer Text / Terms</label>
                                             <textarea
                                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                rows={3}
                                                placeholder="This ticket is non-transferable..."
                                                value={form.pdfSettings?.footerText || ''}
                                                onChange={e => updateFormMetadata({ pdfSettings: { ...form.pdfSettings, footerText: e.target.value } })}
                                             ></textarea>
                                          </div>

                                          <div>
                                             <label className="block text-sm font-bold text-gray-700 mb-2">Organization Info (Address, Tax ID)</label>
                                             <textarea
                                                className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                rows={3}
                                                placeholder="123 Event Street, City, Country"
                                                value={form.pdfSettings?.organizationInfo || ''}
                                                onChange={e => updateFormMetadata({ pdfSettings: { ...form.pdfSettings, organizationInfo: e.target.value } })}
                                             ></textarea>
                                          </div>
                                       </div>
                                    </div>
                                 </div>
                              )}
                           </div>

                           {/* Right Column: Dynamic Previews */}
                           <div className="bg-gray-100/50 rounded-2xl p-4 border border-gray-200 flex flex-col items-center h-fit sticky top-2">
                              <div className="flex items-center justify-between w-full mb-4">
                                 <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    {settingsSubTab === 'appearance' && <><Eye className="w-4 h-4" /> Registration Page Preview</>}
                                    {settingsSubTab === 'success' && <><Eye className="w-4 h-4" /> Success Page Preview</>}
                                    {settingsSubTab === 'pdf' && <><Eye className="w-4 h-4" /> PDF Ticket Preview</>}
                                 </h4>
                                 <span className="px-3 py-1 bg-white rounded-full text-[10px] font-bold text-gray-400 border border-gray-200 uppercase tracking-tighter shadow-sm">Live Updates</span>
                              </div>

                              <div className="w-full flex justify-center scale-75 lg:scale-90 origin-top transition-transform duration-300">
                                 {settingsSubTab === 'appearance' && (
                                    <div
                                       className="rounded-2xl shadow-2xl overflow-hidden border border-gray-200 w-full max-w-md aspect-[9/16] flex flex-col relative"
                                       style={{
                                          backgroundColor: form.settings?.formBackgroundColor || '#F3F4F6',
                                          backgroundImage: form.settings?.formBackgroundImage ? `url(${form.settings.formBackgroundImage})` : 'none',
                                          backgroundSize: 'cover',
                                          backgroundPosition: 'center'
                                       }}
                                    >
                                       {!form.settings?.formBackgroundImage && (
                                          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#4F46E5 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                                       )}

                                       {/* Registration Header */}
                                       <div
                                          className="p-8 text-center relative z-10"
                                          style={{ backgroundColor: form.settings?.formHeaderColor || '#4F46E5' }}
                                       >
                                          <h3
                                             className="text-2xl font-black mb-2"
                                             style={{ color: form.settings?.formTitleColor || '#FFFFFF' }}
                                          >
                                             {form.settings?.formTitle || form.title}
                                          </h3>
                                          <p
                                             className="text-sm opacity-90 font-medium"
                                             style={{ color: form.settings?.formDescriptionColor || '#FFFFFF' }}
                                          >
                                             {form.description}
                                          </p>
                                       </div>

                                       <div className="p-8 flex-1 flex flex-col items-center justify-start z-10">
                                          <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl p-8 w-full max-w-sm space-y-6 border border-white/50">
                                             <div className="space-y-2">
                                                <div className="h-2 w-20 bg-gray-200 rounded-full"></div>
                                                <div className="h-10 w-full bg-gray-50 border border-gray-200 rounded-xl"></div>
                                             </div>
                                             <div className="space-y-2">
                                                <div className="h-2 w-24 bg-gray-200 rounded-full"></div>
                                                <div className="h-10 w-full bg-gray-50 border border-gray-200 rounded-xl"></div>
                                             </div>
                                             <div className="pt-4">
                                                <button
                                                   className="w-full py-4 text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-lg transform transition hover:scale-[1.02]"
                                                   style={{ backgroundColor: form.settings?.formAccentColor || '#4F46E5' }}
                                                >
                                                   {form.settings?.submitButtonText || 'Register Now'}
                                                </button>
                                             </div>
                                          </div>

                                          <div className="mt-8 text-center">
                                             <div className="inline-flex items-center gap-2 px-4 py-2 bg-black/5 backdrop-blur rounded-full border border-black/5">
                                                <Check className="w-3 h-3 text-gray-500" />
                                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Secure Registration</span>
                                             </div>
                                          </div>
                                       </div>
                                    </div>
                                 )}

                                 {settingsSubTab === 'success' && (
                                    <div className="bg-white rounded-2xl shadow-xl p-0 flex flex-col items-center relative overflow-hidden border border-gray-200 w-full max-w-md aspect-[9/16]">
                                       {/* Success Banner */}
                                       <div
                                          className="w-full h-40 flex flex-col items-center justify-center text-white p-6"
                                          style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
                                       >
                                          <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mb-3 animate-bounce-slow">
                                             <Check className="w-8 h-8" style={{ color: form.settings?.successIconColor || '#10B981' }} />
                                          </div>
                                          <h3 className="text-xl font-black text-center leading-tight px-4" style={{ color: form.settings?.successIconColor || '#10B981' }}>
                                             {form.settings?.successTitle || 'Registration Confirmed!'}
                                          </h3>
                                       </div>

                                       <div className="p-8 w-full flex flex-col items-center">
                                          {/* Custom Message Content */}
                                          <div className="prose prose-sm max-w-none text-gray-600 mb-8 w-full text-center">
                                             {form.thankYouMessage ? (
                                                <div dangerouslySetInnerHTML={{ __html: form.thankYouMessage }} />
                                             ) : (
                                                <p className="opacity-50 italic">Your custom message will appear here...</p>
                                             )}
                                          </div>

                                          {/* Dynamic Elements based on settings */}
                                          {(form.settings?.showQrOnSuccess !== false) && (
                                             <div
                                                className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md mb-6 w-full max-w-[280px] relative overflow-hidden transform transition hover:scale-105 duration-300 mx-auto"
                                                style={{ backgroundColor: form.settings?.successFooterColor || '#F9FAFB' }}
                                             >
                                                <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}></div>
                                                <div className="flex justify-between items-start mb-4">
                                                   <div>
                                                      <h4 className="font-bold text-gray-900 text-sm mb-0.5 truncate max-w-[150px]">{form.title}</h4>
                                                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{new Date().toLocaleDateString()}</p>
                                                   </div>
                                                </div>

                                                <div className="bg-white p-2.5 rounded-2xl inline-block mb-4 shadow-sm border border-gray-100">
                                                   <QRCode value="PREVIEW-QR-CODE" size={120} />
                                                </div>

                                                <div className="text-[10px] font-mono bg-white/80 p-2 rounded-xl text-gray-600 border border-gray-200 flex justify-between items-center">
                                                   <span className="text-gray-400 font-bold">InVC ID</span>
                                                   <span className="font-black">#P-12345</span>
                                                </div>
                                             </div>
                                          )}

                                          {(form.settings?.showTicketButtonOnSuccess !== false) && (
                                             <button
                                                className="w-full max-w-[280px] py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition shadow-lg"
                                                style={{
                                                   backgroundColor: (form.settings?.successHeaderColor || '#4F46E5') + '15',
                                                   color: form.settings?.successHeaderColor || '#4F46E5',
                                                   border: `1px solid ${(form.settings?.successHeaderColor || '#4F46E5')}30`
                                                }}
                                             >
                                                <Download className="w-4 h-4" /> Download Ticket
                                             </button>
                                          )}
                                       </div>
                                    </div>
                                 )}

                                 {settingsSubTab === 'pdf' && (
                                    <div className="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center relative overflow-hidden ring-4 ring-gray-200/50 w-full max-w-md aspect-[1/1.414]">
                                       {/* PDF Simulation Layout */}
                                       <div className="w-full flex justify-between items-start border-b-2 border-dashed border-gray-100 pb-8 mb-8">
                                          <div className="max-w-[70%] text-left">
                                             <h1 className="text-2xl font-black text-gray-900 mb-2 leading-tight" style={{ color: form.pdfSettings?.primaryColor }}>
                                                {form.pdfSettings?.eventTitle || form.title}
                                             </h1>
                                             <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">{form.pdfSettings?.organizationName || "Your Organization"}</p>
                                          </div>
                                          <div className="w-20 h-20 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-center p-2">
                                             {form.pdfSettings?.logoUrl ? (
                                                <img src={form.pdfSettings.logoUrl} className="w-full h-full object-contain" alt="Logo" />
                                             ) : (
                                                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                                             )}
                                          </div>
                                       </div>

                                       <div className="w-full grid grid-cols-2 gap-8 mb-12">
                                          <div className="space-y-4">
                                             <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Attendee Name</label>
                                                <p className="text-sm font-bold text-gray-800 border-b border-gray-100 pb-2">John Smith</p>
                                             </div>
                                             <div>
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Ticket Type</label>
                                                <p className="text-sm font-black text-indigo-600 border-b border-gray-100 pb-2">VIP PASS</p>
                                             </div>
                                          </div>
                                          <div className="flex flex-col items-center justify-center bg-gray-50 rounded-2xl p-6 border border-gray-100 shadow-inner">
                                             <QRCode value="PDF-PREVIEW" size={100} />
                                             <p className="mt-4 text-[10px] font-mono font-bold text-gray-400">#ABC-123-456</p>
                                          </div>
                                       </div>

                                       <div className="mt-auto w-full pt-8 border-t-2 border-dashed border-gray-100">
                                          <div className="grid grid-cols-2 gap-8">
                                             <div className="text-left">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Org & Location</label>
                                                <p className="text-[10px] text-gray-600 whitespace-pre-line leading-relaxed italic">
                                                   {form.pdfSettings?.organizationInfo || "123 Event Street\nCity, Country\nTax ID: 12-3456"}
                                                </p>
                                             </div>
                                             <div className="text-right">
                                                <p className="text-[9px] text-gray-400 leading-relaxed italic">
                                                   {form.pdfSettings?.footerText || "This ticket is non-transferable and requires a valid ID for entry at the gate."}
                                                </p>
                                             </div>
                                          </div>
                                       </div>
                                       <p className="text-center text-[10px] font-bold text-gray-400 mt-6 uppercase tracking-widest animate-pulse">
                                          Previewing real-time changes
                                       </p>
                                    </div>
                                 )}
                              </div>
                              <p className="text-center text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest animate-pulse w-full">
                                 Previewing live updates
                              </p>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
            )}

            {activeTab === 'preview' && (
               <FormPreview form={form} />
            )}
         </div>
      </div>
   );
};

export default FormBuilder;