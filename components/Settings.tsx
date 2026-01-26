import React, { useState, useEffect } from 'react';
import { Save, CreditCard, Mail, Key, Eye, FileText, Check, Upload, Image as ImageIcon } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS, Attendee } from '../types';
import { getSettings, saveSettings, getAttendees } from '../services/storageService';
import { generateTicketPDF } from '../utils/pdfGenerator';
import RichTextEditor from './RichTextEditor';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'general' | 'email' | 'pdf'>('general');
  const [saved, setSaved] = useState(false);
  const [previewMode, setPreviewMode] = useState<'ticket' | 'invite'>('ticket');
  const [dummyAttendee, setDummyAttendee] = useState<Attendee | null>(null);

  useEffect(() => {
    setSettings(getSettings());
    const attendees = getAttendees();
    if (attendees.length > 0) {
      setDummyAttendee(attendees[0]);
    } else {
      // Create a mock one if none exists
      setDummyAttendee({
        id: 'MOCK-123',
        formId: 'form-1',
        formTitle: 'Annual Gala 2025',
        name: 'John Doe',
        email: 'john@example.com',
        ticketType: 'VIP x1',
        registeredAt: new Date().toISOString(),
        qrPayload: 'mock-payload',
        invoiceId: 'INV-001'
      });
    }
  }, []);

  const handleChange = (field: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handlePdfChange = (field: keyof typeof settings.pdfSettings, value: any) => {
    setSettings(prev => ({ ...prev, pdfSettings: { ...prev.pdfSettings, [field]: value } }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'emailHeaderLogo' | 'pdfLogo') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (field === 'emailHeaderLogo') {
        handleChange('emailHeaderLogo', base64);
      } else {
        handlePdfChange('logoUrl', base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const generatePreviewHtml = (templateType: 'ticket' | 'invite') => {
    const template = templateType === 'ticket' ? settings.emailBodyTemplate : settings.emailInvitationBody;
    const body = dummyAttendee ? template
      .replace(/{{name}}/g, dummyAttendee.name)
      .replace(/{{event}}/g, dummyAttendee.formTitle)
      .replace(/{{id}}/g, dummyAttendee.id)
      .replace(/{{invoiceId}}/g, dummyAttendee.invoiceId || 'N/A')
      .replace(/{{amount}}/g, settings.ticketPrice.toString())
      .replace(/{{link}}/g, '#register-link') : template;

    // Wrap in standard HTML structure with header/footer
    return `
      <div style="font-family: sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
        ${settings.emailHeaderLogo ? `<div style="background: #f8fafc; padding: 20px; text-align: center; border-bottom: 1px solid #eee;"><img src="${settings.emailHeaderLogo}" style="max-height: 60px;" alt="Logo"/></div>` : ''}
        <div style="padding: 30px;">
          ${body}
        </div>
        <div style="background: #f8fafc; padding: 15px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #eee;">
          ${settings.emailFooterText}
        </div>
      </div>
    `;
  };

  const handlePdfPreview = () => {
    if (dummyAttendee) {
       const doc = generateTicketPDF(dummyAttendee, settings);
       window.open(doc.output('bloburl'), '_blank');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <header className="mb-8 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Platform Settings</h2>
          <p className="text-gray-500">Manage payments, communication, and ticket branding.</p>
        </div>
        <button 
            onClick={handleSave} 
            className={`flex items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-all shadow-md ${
              saved ? 'bg-green-600' : 'bg-gray-900 hover:bg-gray-800'
            }`}
          >
            {saved ? <Check className="w-5 h-5" /> : <Save className="w-5 h-5" />}
            {saved ? 'Saved' : 'Save Changes'}
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[600px] flex flex-col md:flex-row">
        {/* Sidebar Tabs */}
        <div className="w-full md:w-64 bg-gray-50 border-r border-gray-200 flex-shrink-0">
           <div className="p-4 space-y-2">
             <button 
               onClick={() => setActiveTab('general')}
               className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 font-medium transition-colors ${activeTab === 'general' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:bg-white/50'}`}
             >
               <CreditCard className="w-5 h-5" /> General & Payment
             </button>
             <button 
               onClick={() => setActiveTab('email')}
               className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 font-medium transition-colors ${activeTab === 'email' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:bg-white/50'}`}
             >
               <Mail className="w-5 h-5" /> Email Templates
             </button>
             <button 
               onClick={() => setActiveTab('pdf')}
               className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 font-medium transition-colors ${activeTab === 'pdf' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:bg-white/50'}`}
             >
               <FileText className="w-5 h-5" /> PDF Ticket
             </button>
           </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-8 overflow-y-auto">
           {activeTab === 'general' && (
             <div className="space-y-8 animate-fade-in-up">
                <div>
                   <h3 className="text-lg font-bold text-gray-900 mb-4">Payment Configuration</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">PayPal Client ID</label>
                        <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          value={settings.paypalClientId} onChange={e => handleChange('paypalClientId', e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                        <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                          value={settings.currency} onChange={e => handleChange('currency', e.target.value)} />
                      </div>
                   </div>
                </div>
                <div className="border-t border-gray-100 pt-8">
                   <h3 className="text-lg font-bold text-gray-900 mb-4">SMTP Configuration</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" value={settings.smtpHost} onChange={e => handleChange('smtpHost', e.target.value)} /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" value={settings.smtpPort} onChange={e => handleChange('smtpPort', e.target.value)} /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" value={settings.smtpUser} onChange={e => handleChange('smtpUser', e.target.value)} /></div>
                      <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input type="password" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none" value={settings.smtpPass} onChange={e => handleChange('smtpPass', e.target.value)} /></div>
                   </div>
                </div>
             </div>
           )}

           {activeTab === 'email' && (
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
               <div className="flex flex-col gap-4">
                  <div className="flex gap-2 mb-2">
                    <button 
                      onClick={() => setPreviewMode('ticket')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border ${previewMode === 'ticket' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                    >
                      Ticket Confirmation
                    </button>
                    <button 
                      onClick={() => setPreviewMode('invite')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border ${previewMode === 'invite' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                    >
                      Invitation / Marketing
                    </button>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
                    <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                       value={previewMode === 'ticket' ? settings.emailSubject : settings.emailInvitationSubject}
                       onChange={e => handleChange(previewMode === 'ticket' ? 'emailSubject' : 'emailInvitationSubject', e.target.value)}
                    />
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Header Logo</label>
                     <div className="flex gap-2">
                       <label className="flex-1 cursor-pointer">
                          <div className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 text-sm">
                            <Upload className="w-4 h-4" /> 
                            <span className="truncate">{settings.emailHeaderLogo ? 'Change Logo Image' : 'Upload Logo Image'}</span>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'emailHeaderLogo')} />
                       </label>
                       {settings.emailHeaderLogo && (
                         <div className="w-10 h-10 border rounded overflow-hidden flex items-center justify-center bg-gray-50">
                           <img src={settings.emailHeaderLogo} alt="Header" className="max-w-full max-h-full" />
                         </div>
                       )}
                     </div>
                  </div>
                  
                  <div className="flex-1 flex flex-col">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body Content</label>
                    <RichTextEditor 
                      value={previewMode === 'ticket' ? settings.emailBodyTemplate : settings.emailInvitationBody}
                      onChange={(val) => handleChange(previewMode === 'ticket' ? 'emailBodyTemplate' : 'emailInvitationBody', val)}
                      className="flex-1"
                      placeholder="Draft your email content here..."
                    />
                  </div>

                  <div>
                     <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
                     <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                       value={settings.emailFooterText} onChange={e => handleChange('emailFooterText', e.target.value)} />
                  </div>
               </div>

               <div className="bg-gray-100 rounded-xl p-6 flex flex-col">
                  <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Live Preview
                  </h4>
                  <div className="bg-gray-200 flex-1 rounded-lg shadow-sm border border-gray-300 p-4 overflow-y-auto">
                     <div className="bg-white rounded-lg shadow-sm overflow-hidden min-h-full">
                        <div 
                          className="w-full"
                          dangerouslySetInnerHTML={{ __html: generatePreviewHtml(previewMode) }}
                        />
                     </div>
                  </div>
               </div>
             </div>
           )}

           {activeTab === 'pdf' && (
             <div className="space-y-6">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-bold text-gray-900">PDF Ticket Customization</h3>
                  <button onClick={handlePdfPreview} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition">
                     <Eye className="w-4 h-4" /> Preview PDF
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                         value={settings.pdfSettings.organizationName} onChange={e => handlePdfChange('organizationName', e.target.value)} />
                   </div>
                   <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color (Hex)</label>
                      <div className="flex gap-2">
                        <input type="color" className="h-10 w-10 rounded border border-gray-300 p-1 cursor-pointer"
                           value={settings.pdfSettings.primaryColor} onChange={e => handlePdfChange('primaryColor', e.target.value)} />
                        <input type="text" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none uppercase"
                           value={settings.pdfSettings.primaryColor} onChange={e => handlePdfChange('primaryColor', e.target.value)} />
                      </div>
                   </div>
                   
                   <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Logo</label>
                      <div className="flex gap-4 items-center">
                         {settings.pdfSettings.logoUrl && (
                           <img src={settings.pdfSettings.logoUrl} alt="PDF Logo" className="h-12 w-auto border rounded" />
                         )}
                         <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
                            <ImageIcon className="w-4 h-4" /> Upload Logo
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'pdfLogo')} />
                         </label>
                      </div>
                   </div>

                   <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Organization Info (Address, Tax ID, etc)</label>
                      <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                         value={settings.pdfSettings.organizationInfo} onChange={e => handlePdfChange('organizationInfo', e.target.value)} />
                   </div>
                   <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text / Disclaimer</label>
                      <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                         value={settings.pdfSettings.footerText} onChange={e => handlePdfChange('footerText', e.target.value)} />
                   </div>
                </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default Settings;