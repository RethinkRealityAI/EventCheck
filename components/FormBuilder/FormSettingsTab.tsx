import React, { useState } from 'react';
import { Plus, X, Settings, Layout, Check, FileText, Eye, CreditCard, AlertCircle, Download } from 'lucide-react';
import QRCode from 'react-qr-code';
import { Form } from '../../types';
import RichTextEditor from '../RichTextEditor';

interface FormSettingsTabProps {
    form: Form;
    onUpdate: (updates: Partial<Form>) => void;
    onImageUpload: (e: React.ChangeEvent<HTMLInputElement>, type: 'background' | 'logo' | 'card_background') => void;
}

type SubTab = 'appearance' | 'success' | 'pdf';

const FormSettingsTab: React.FC<FormSettingsTabProps> = ({ form, onUpdate, onImageUpload }) => {
    const [subTab, setSubTab] = useState<SubTab>('appearance');

    return (
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
                                    onClick={() => setSubTab('appearance')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${subTab === 'appearance' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Layout className="w-4 h-4" /> Appearance
                                </button>
                                <button
                                    onClick={() => setSubTab('success')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${subTab === 'success' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <Check className="w-4 h-4" /> Success Page
                                </button>
                                <button
                                    onClick={() => setSubTab('pdf')}
                                    className={`px-4 py-2 rounded-lg text-sm font-bold transition flex items-center gap-2 ${subTab === 'pdf' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    <FileText className="w-4 h-4" /> PDF Ticket
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-12">
                        {/* Left Column: Inputs */}
                        <div className="space-y-8">
                            {subTab === 'appearance' && (
                                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                                    <div>
                                        <h4 className="text-lg font-bold text-gray-900 mb-4">Registration Form Visuals</h4>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                            {[
                                                { key: 'formHeaderColor', label: 'Form Header Color', fallback: '#4F46E5' },
                                                { key: 'formAccentColor', label: 'Accent Color (Buttons)', fallback: '#4F46E5' },
                                                { key: 'formBackgroundColor', label: 'Background Color', fallback: '#F3F4F6' },
                                                { key: 'formTitleColor', label: 'Title Text Color', fallback: '#FFFFFF' },
                                            ].map(({ key, label, fallback }) => (
                                                <div key={key}>
                                                    <label className="block text-xs font-bold text-gray-700 mb-1.5">{label}</label>
                                                    <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                        <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                            value={(form.settings as any)?.[key] || fallback}
                                                            onChange={e => onUpdate({ settings: { ...form.settings, [key]: e.target.value } })} />
                                                        <span className="text-xs font-mono font-bold text-gray-600">{(form.settings as any)?.[key] || fallback}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-bold text-gray-900 mb-4">Form Text Customization</h4>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Form Title (Override)</label>
                                                <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                    placeholder={form.title}
                                                    value={form.settings?.formTitle || ''}
                                                    onChange={e => onUpdate({ settings: { ...form.settings, formTitle: e.target.value } })} />
                                                <p className="text-xs text-gray-500 mt-1 italic">Leave blank to use the default form title</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Submit Button Text</label>
                                                <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                    placeholder="Register Now"
                                                    value={form.settings?.submitButtonText || ''}
                                                    onChange={e => onUpdate({ settings: { ...form.settings, submitButtonText: e.target.value } })} />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Page Background Image</label>
                                        <div className="flex items-center gap-3">
                                            {form.settings?.formBackgroundImage ? (
                                                <div className="relative group">
                                                    <img src={form.settings.formBackgroundImage} alt="Background" className="w-24 h-14 object-cover rounded-lg border border-indigo-100 shadow-sm" />
                                                    <button
                                                        onClick={() => onUpdate({ settings: { ...form.settings, formBackgroundImage: undefined } })}
                                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-lg"
                                                    >
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <label className="w-24 h-14 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition group">
                                                    <Plus className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                                                    <span className="text-[9px] font-bold text-gray-400 group-hover:text-indigo-500 mt-0.5 uppercase">Upload</span>
                                                    <input type="file" className="hidden" accept="image/*" onChange={e => onImageUpload(e, 'background')} />
                                                </label>
                                            )}
                                            <p className="text-xs text-gray-500 leading-relaxed italic">Background for the entire registration page.</p>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Form Card Background Image</label>
                                        <div className="flex items-center gap-3">
                                            {form.settings?.cardBackgroundImage ? (
                                                <div className="relative group">
                                                    <img src={form.settings.cardBackgroundImage} alt="Card Background" className="w-24 h-14 object-cover rounded-lg border border-indigo-100 shadow-sm" />
                                                    <button
                                                        onClick={() => onUpdate({ settings: { ...form.settings, cardBackgroundImage: undefined } })}
                                                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-lg"
                                                    >
                                                        <X className="w-2.5 h-2.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <label className="w-24 h-14 border border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition group">
                                                    <Plus className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                                                    <span className="text-[9px] font-bold text-gray-400 group-hover:text-indigo-500 mt-0.5 uppercase">Upload</span>
                                                    <input type="file" className="hidden" accept="image/*" onChange={e => onImageUpload(e, 'card_background')} />
                                                </label>
                                            )}
                                            <p className="text-[10px] text-gray-500 leading-relaxed italic">Background image for the form card.</p>
                                        </div>
                                    </div>

                                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex items-center justify-between cursor-pointer group"
                                        onClick={() => onUpdate({ settings: { ...form.settings, transparentBackground: !form.settings?.transparentBackground } })}
                                    >
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition">Transparent Page Background</span>
                                            <span className="text-xs text-gray-500">Enable this if you are embedding the form in another website.</span>
                                        </div>
                                        <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${form.settings?.transparentBackground ? 'bg-indigo-600' : 'bg-gray-300'}`}>
                                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${form.settings?.transparentBackground ? 'translate-x-6' : ''}`}></div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-bold text-gray-700 mb-2">Base Currency & Pricing</label>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="relative">
                                                <input type="text" className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                    placeholder="USD"
                                                    value={form.settings?.currency || 'USD'}
                                                    onChange={e => onUpdate({ settings: { ...form.settings, currency: e.target.value } })} />
                                                <CreditCard className="w-5 h-5 text-gray-400 absolute left-3 top-3.5" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {subTab === 'success' && (
                                <div className="space-y-6 animate-in slide-in-from-left-4 duration-300">
                                    <div className="grid grid-cols-1 gap-6">
                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Success Title</label>
                                            <input type="text" className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                                placeholder="Registration Confirmed!"
                                                value={form.settings?.successTitle || ''}
                                                onChange={e => onUpdate({ settings: { ...form.settings, successTitle: e.target.value } })} />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Success Theme Colors</label>
                                            <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border">
                                                {[
                                                    { key: 'successHeaderColor', label: 'Header BG', fallback: '#4F46E5' },
                                                    { key: 'successIconColor', label: 'Icon/Check', fallback: '#10B981' },
                                                    { key: 'successFooterColor', label: 'Card Accent', fallback: '#F9FAFB' },
                                                ].map(({ key, label, fallback }) => (
                                                    <div key={key}>
                                                        <label className="block text-[10px] uppercase font-bold text-gray-400 mb-1">{label}</label>
                                                        <div className="flex items-center gap-2">
                                                            <input type="color" className="w-7 h-7 rounded border-none cursor-pointer p-0 bg-transparent"
                                                                value={(form.settings as any)?.[key] || fallback}
                                                                onChange={e => onUpdate({ settings: { ...form.settings, [key]: e.target.value } })} />
                                                            <span className="text-[10px] font-mono font-bold">{(form.settings as any)?.[key] || fallback}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Success Page Elements</label>
                                            <div className="bg-gray-50 rounded-xl p-6 space-y-4 border border-gray-200">
                                                {[
                                                    { key: 'showQrOnSuccess', label: 'Show QR Code Card', desc: 'Provide a digital check-in card immediately after registration.' },
                                                    { key: 'showTicketButtonOnSuccess', label: "Show 'Download Ticket' Button", desc: 'Allow users to download their official PDF ticket.' },
                                                ].map(({ key, label, desc }) => (
                                                    <React.Fragment key={key}>
                                                        {key !== 'showQrOnSuccess' && <hr className="border-gray-200" />}
                                                        <label className="flex items-center justify-between cursor-pointer group">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition">{label}</span>
                                                                <span className="text-xs text-gray-500">{desc}</span>
                                                            </div>
                                                            <div
                                                                className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${(form.settings as any)?.[key] !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
                                                                onClick={() => onUpdate({ settings: { ...form.settings, [key]: !((form.settings as any)?.[key] !== false) } })}
                                                            >
                                                                <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${(form.settings as any)?.[key] !== false ? 'translate-x-6' : ''}`}></div>
                                                            </div>
                                                        </label>
                                                    </React.Fragment>
                                                ))}
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-gray-700 mb-2">Custom Thank You Message</label>
                                            <RichTextEditor
                                                value={form.thankYouMessage || ''}
                                                onChange={(val) => onUpdate({ thankYouMessage: val })}
                                                placeholder="e.g. Thanks for registering! We look forward to seeing you."
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {subTab === 'pdf' && (
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
                                                        onChange={e => onUpdate({ pdfSettings: { ...form.pdfSettings, eventTitle: e.target.value } })} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Primary Color</label>
                                                    <div className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border">
                                                        <input type="color" className="w-8 h-8 rounded-md border-none cursor-pointer p-0 bg-transparent"
                                                            value={form.pdfSettings?.primaryColor || '#4F46E5'}
                                                            onChange={e => onUpdate({ pdfSettings: { ...form.pdfSettings, primaryColor: e.target.value } })} />
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
                                                        onChange={e => onUpdate({ pdfSettings: { ...form.pdfSettings, organizationName: e.target.value } })} />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-2">Custom Logo</label>
                                                    <div className="flex items-center gap-4">
                                                        {form.pdfSettings?.logoUrl ? (
                                                            <div className="relative group">
                                                                <img src={form.pdfSettings.logoUrl} className="w-12 h-12 object-contain rounded-lg border border-indigo-100 shadow-sm p-1" alt="Logo" />
                                                                <button
                                                                    onClick={() => onUpdate({ pdfSettings: { ...form.pdfSettings, logoUrl: undefined } })}
                                                                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition shadow-lg"
                                                                >
                                                                    <X className="w-2.5 h-2.5" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <label className="w-12 h-12 border border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition group">
                                                                <Plus className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" />
                                                                <input type="file" className="hidden" accept="image/*" onChange={e => onImageUpload(e, 'logo')} />
                                                            </label>
                                                        )}
                                                        <p className="text-[10px] text-gray-400 italic">Square or horizontal logo. PNG/JPG.</p>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Footer Text / Terms</label>
                                                <textarea className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" rows={3}
                                                    placeholder="This ticket is non-transferable..."
                                                    value={form.pdfSettings?.footerText || ''}
                                                    onChange={e => onUpdate({ pdfSettings: { ...form.pdfSettings, footerText: e.target.value } })}></textarea>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-bold text-gray-700 mb-2">Organization Info (Address, Tax ID)</label>
                                                <textarea className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition" rows={3}
                                                    placeholder="123 Event Street, City, Country"
                                                    value={form.pdfSettings?.organizationInfo || ''}
                                                    onChange={e => onUpdate({ pdfSettings: { ...form.pdfSettings, organizationInfo: e.target.value } })}></textarea>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Right Column: Live Preview */}
                        <div className="bg-gray-100/50 rounded-2xl p-4 border border-gray-200 flex flex-col items-center h-fit sticky top-2">
                            <div className="flex items-center justify-between w-full mb-4">
                                <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                    {subTab === 'appearance' && <><Eye className="w-4 h-4" /> Registration Page Preview</>}
                                    {subTab === 'success' && <><Eye className="w-4 h-4" /> Success Page Preview</>}
                                    {subTab === 'pdf' && <><Eye className="w-4 h-4" /> PDF Ticket Preview</>}
                                </h4>
                                <span className="px-3 py-1 bg-white rounded-full text-[10px] font-bold text-gray-400 border border-gray-200 uppercase tracking-tighter shadow-sm">Live Updates</span>
                            </div>

                            <div className="w-full flex justify-center scale-75 lg:scale-90 origin-top transition-transform duration-300">
                                {subTab === 'appearance' && (
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
                                        <div className="p-8 text-center relative z-10" style={{ backgroundColor: form.settings?.formHeaderColor || '#4F46E5' }}>
                                            <h3 className="text-2xl font-black mb-2" style={{ color: form.settings?.formTitleColor || '#FFFFFF' }}>
                                                {form.settings?.formTitle || form.title}
                                            </h3>
                                            <p className="text-sm opacity-90 font-medium" style={{ color: form.settings?.formDescriptionColor || '#FFFFFF' }}>
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
                                                    <button className="w-full py-4 text-white font-black text-sm uppercase tracking-widest rounded-xl shadow-lg"
                                                        style={{ backgroundColor: form.settings?.formAccentColor || '#4F46E5' }}>
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

                                {subTab === 'success' && (
                                    <div className="bg-white rounded-2xl shadow-xl p-0 flex flex-col items-center relative overflow-hidden border border-gray-200 w-full max-w-md aspect-[9/16]">
                                        <div className="w-full h-40 flex flex-col items-center justify-center text-white p-6"
                                            style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}>
                                            <div className="w-16 h-16 bg-white/20 backdrop-blur rounded-full flex items-center justify-center mb-3 animate-bounce-slow">
                                                <Check className="w-8 h-8" style={{ color: form.settings?.successIconColor || '#10B981' }} />
                                            </div>
                                            <h3 className="text-xl font-black text-center leading-tight px-4" style={{ color: form.settings?.successIconColor || '#10B981' }}>
                                                {form.settings?.successTitle || 'Registration Confirmed!'}
                                            </h3>
                                        </div>
                                        <div className="p-8 w-full flex flex-col items-center">
                                            <div className="prose prose-sm max-w-none text-gray-600 mb-8 w-full text-center">
                                                {form.thankYouMessage ? (
                                                    <div dangerouslySetInnerHTML={{ __html: form.thankYouMessage }} />
                                                ) : (
                                                    <p className="opacity-50 italic">Your custom message will appear here...</p>
                                                )}
                                            </div>
                                            {(form.settings?.showQrOnSuccess !== false) && (
                                                <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-md mb-6 w-full max-w-[280px] relative overflow-hidden mx-auto"
                                                    style={{ backgroundColor: form.settings?.successFooterColor || '#F9FAFB' }}>
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
                                                <button className="w-full max-w-[280px] py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-3 transition shadow-lg"
                                                    style={{
                                                        backgroundColor: (form.settings?.successHeaderColor || '#4F46E5') + '15',
                                                        color: form.settings?.successHeaderColor || '#4F46E5',
                                                        border: `1px solid ${(form.settings?.successHeaderColor || '#4F46E5')}30`
                                                    }}>
                                                    <Download className="w-4 h-4" /> Download Ticket
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {subTab === 'pdf' && (
                                    <div className="bg-white rounded-lg shadow-2xl p-8 flex flex-col items-center relative overflow-hidden ring-4 ring-gray-200/50 w-full max-w-md aspect-[1/1.414]">
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
    );
};

export default FormSettingsTab;
