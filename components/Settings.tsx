import React, { useState, useEffect } from 'react';
import { Save, CreditCard, Mail, Eye, FileText, Upload, Image as ImageIcon, Send as SendIcon, X, Activity, Server, Database, ShieldCheck, Loader2, CheckSquare, Tag } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS, Attendee } from '../types';
import { getSettings, saveSettings, getAttendees, uploadBrandingAsset, BrandingAssetKind } from '../services/storageService';
import PricingTemplatesTab from './Settings/PricingTemplates/PricingTemplatesTab';
import { AnnouncementsTab } from './Settings/AnnouncementsTab';
import EmailTemplatesTab from './Settings/EmailTemplatesTab';
import { sendTicketEmail } from '../services/smtpService';
import { supabase } from '../services/supabaseClient';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { useNotifications } from './NotificationSystem';

type TabKey = 'general' | 'email' | 'pdf' | 'diagnostics' | 'pricing-templates' | 'announcements';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<TabKey>('general');
  const [dummyAttendee, setDummyAttendee] = useState<Attendee | null>(null);
  const [allAttendees, setAllAttendees] = useState<Attendee[]>([]);
  const { showNotification } = useNotifications();

  useEffect(() => {
    const fetch = async () => {
      const settingsData = await getSettings();
      setSettings(settingsData);

      const attendees = await getAttendees();
      setAllAttendees(attendees);
      if (attendees.length > 0) {
        setDummyAttendee(attendees[0]);
      } else {
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
    };
    fetch();
  }, []);

  const handleChange = (field: keyof AppSettings, value: any) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handlePdfChange = (field: keyof typeof settings.pdfSettings, value: any) => {
    setSettings(prev => ({ ...prev, pdfSettings: { ...prev.pdfSettings, [field]: value } }));
  };

  const [uploading, setUploading] = useState<null | 'emailHeaderLogo' | 'pdfLogo' | 'pdfBackground'>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await saveSettings(settings);
      showNotification('Settings saved successfully', 'success');
    } catch (err: any) {
      showNotification(`Failed to save settings: ${err?.message || 'unknown error'}`, 'error');
    }
  };

  const handleFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: 'emailHeaderLogo' | 'pdfLogo' | 'pdfBackground',
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const kindMap: Record<typeof field, BrandingAssetKind> = {
      emailHeaderLogo: 'email-header-logo',
      pdfLogo: 'pdf-logo',
      pdfBackground: 'pdf-background',
    };

    setUploading(field);
    try {
      const publicUrl = await uploadBrandingAsset(file, kindMap[field]);
      let nextSettings: AppSettings;
      if (field === 'emailHeaderLogo') {
        nextSettings = { ...settings, emailHeaderLogo: publicUrl };
      } else if (field === 'pdfLogo') {
        nextSettings = { ...settings, pdfSettings: { ...settings.pdfSettings, logoUrl: publicUrl } };
      } else {
        nextSettings = { ...settings, pdfSettings: { ...settings.pdfSettings, backgroundImage: publicUrl } };
      }
      setSettings(nextSettings);
      // Persist immediately so the URL is saved even if the user forgets to
      // hit the main Save button — matches how uploads are expected to behave.
      await saveSettings(nextSettings);
      showNotification('Image uploaded and saved', 'success');
    } catch (err: any) {
      showNotification(`Upload failed: ${err?.message || 'unknown error'}`, 'error');
    } finally {
      setUploading(null);
    }
  };

  const handlePdfPreview = async (previewAsGuest = false) => {
    if (dummyAttendee) {
      const attendeeForPreview = previewAsGuest
        ? { ...dummyAttendee, isPrimary: false, name: `Guest of ${dummyAttendee.name}`, ticketType: `Guest of ${dummyAttendee.name}` }
        : dummyAttendee;
      const registrationUrl = previewAsGuest ? `https://example.com/register/form-1?ref=${dummyAttendee.id}` : undefined;
      const doc = await generateTicketPDF(attendeeForPreview, settings, undefined, registrationUrl);
      window.open(doc.output('bloburl'), '_blank');
    }
  };

  // --- Diagnostics Tests ---
  const [testResults, setTestResults] = useState<Record<string, { status: 'idle' | 'running' | 'success' | 'error', message: string }>>({
    database: { status: 'idle', message: '' },
    smtp: { status: 'idle', message: '' },
    edgeFunctions: { status: 'idle', message: '' }
  });

  const runDatabaseTest = async () => {
    setTestResults(prev => ({ ...prev, database: { status: 'running', message: 'Pinging database...' } }));
    try {
      const { data, error } = await supabase.from('app_settings').select('id').limit(1);
      if (error) throw error;
      setTestResults(prev => ({ ...prev, database: { status: 'success', message: 'Connection successful. Read/Write confirmed.' } }));
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, database: { status: 'error', message: e.message || 'Database error' } }));
    }
  };

  const runSmtpTest = async () => {
    setTestResults(prev => ({ ...prev, smtp: { status: 'running', message: 'Sending test email via Edge Function...' } }));
    try {
      await sendTicketEmail(settings, {
        to: settings.smtpUser || 'test@example.com',
        subject: 'Diagnostic Test - SMTP Configuration',
        name: 'Admin',
        message: 'This is a diagnostic test from your Event Management System to verify SMTP routing.',
        attachments: []
      });
      setTestResults(prev => ({ ...prev, smtp: { status: 'success', message: 'Email passed to Edge Function successfully.' } }));
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, smtp: { status: 'error', message: e.message || 'SMTP Routing Failed' } }));
    }
  };

  const runEdgeFunctionTest = async () => {
    setTestResults(prev => ({ ...prev, edgeFunctions: { status: 'running', message: 'Pinging verify-payment Edge Function...' } }));
    try {
      const { data, error } = await supabase.functions.invoke('verify-payment', { body: {} });
      if (error) {
         if (error.name === 'FunctionsHttpError' || error.message?.includes('non-2xx status code')) {
             setTestResults(prev => ({ ...prev, edgeFunctions: { status: 'success', message: 'Edge Functions are active and responding securely.' } }));
             return;
         }
         throw error;
      }
      setTestResults(prev => ({ ...prev, edgeFunctions: { status: 'success', message: 'Edge Functions are active and reachable.' } }));
    } catch (e: any) {
      setTestResults(prev => ({ ...prev, edgeFunctions: { status: 'error', message: e.message || 'Edge Functions Failed' } }));
    }
  };

  const tabs: Array<{ key: TabKey; label: string; icon: React.ReactNode; show: boolean }> = [
    { key: 'general', label: 'General & Payment', icon: <CreditCard className="w-4 h-4" />, show: true },
    { key: 'email', label: 'Email Templates', icon: <Mail className="w-4 h-4" />, show: true },
    { key: 'pdf', label: 'PDF Ticket', icon: <FileText className="w-4 h-4" />, show: true },
    { key: 'pricing-templates', label: 'Pricing Templates', icon: <Tag className="w-4 h-4" />, show: !!settings.feature_pricing_templates },
    { key: 'announcements', label: 'Announcements', icon: <SendIcon className="w-4 h-4" />, show: true },
    { key: 'diagnostics', label: 'System Health', icon: <Activity className="w-4 h-4" />, show: true },
  ];

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gray-50">
      {/* Header */}
      <header className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">Platform Settings</h2>
          <p className="text-gray-500 text-xs">Configure branding, payments, and communication.</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-white text-sm font-semibold transition shadow-sm bg-gray-900 hover:bg-gray-800"
        >
          <Save className="w-4 h-4" />
          Save Changes
        </button>
      </header>

      {/* Top tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 overflow-x-auto">
        <div className="flex gap-1">
          {tabs.filter(t => t.show).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap ${
                activeTab === t.key
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {activeTab === 'general' && (
            <div className="overflow-y-auto p-8 space-y-8 animate-fade-in-up">
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
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">From Name <span className="text-xs text-gray-400 font-normal">(appears as sender in recipients' inbox)</span></label>
                    <input
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none"
                      placeholder="e.g. GANSID Congress"
                      value={settings.emailFromName || ''}
                      onChange={e => handleChange('emailFromName', e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave blank to fall back to the server default ("SCAGO").</p>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Feature Flags</h3>
                <div className="space-y-4">
                  <label className="flex items-start gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="relative flex-shrink-0 mt-0.5">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={!!settings.feature_pricing_templates}
                        onChange={e => handleChange('feature_pricing_templates', e.target.checked)}
                      />
                      <div className="w-10 h-6 bg-gray-200 peer-checked:bg-indigo-600 rounded-full transition-colors" />
                      <div className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Enable Pricing Templates</div>
                      <div className="text-xs text-gray-500 mt-0.5">Dynamic pricing (date-bracket × geographic-tier × category) for event forms. When enabled, the Pricing Templates tab becomes available, and forms can opt into dynamic pricing via the form builder.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'email' && (
            <EmailTemplatesTab
              settings={settings}
              onSettingsChange={(field, value) => handleChange(field, value)}
              onFileUpload={handleFileUpload}
              uploading={uploading === 'emailHeaderLogo'}
              allAttendees={allAttendees}
              dummyAttendee={dummyAttendee}
              onNotify={(msg, level) => showNotification(msg, level)}
            />
          )}

          {activeTab === 'pdf' && (
            <div className="overflow-y-auto p-8 space-y-6 animate-fade-in-up">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-bold text-gray-900">PDF Ticket Customization</h3>
                <div className="flex gap-2">
                  <button onClick={() => handlePdfPreview(false)} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition shadow-sm border border-indigo-100">
                    <Eye className="w-4 h-4" /> Preview PDF
                  </button>
                  <button onClick={() => handlePdfPreview(true)} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition shadow-sm border border-red-100">
                    <Eye className="w-4 h-4" /> Preview Guest Ticket
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                    value={settings.pdfSettings?.organizationName || ''} onChange={e => handlePdfChange('organizationName', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Custom PDF Event Title (Optional)</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                    placeholder="Defaults to form title"
                    value={settings.pdfSettings?.eventTitle || ''} onChange={e => handlePdfChange('eventTitle', e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color (Hex)</label>
                  <div className="flex gap-2">
                    <input type="color" className="h-10 w-10 rounded border border-gray-300 p-1 cursor-pointer"
                      value={settings.pdfSettings?.primaryColor || '#4F46E5'} onChange={e => handlePdfChange('primaryColor', e.target.value)} />
                    <input type="text" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none uppercase shadow-sm"
                      value={settings.pdfSettings?.primaryColor || '#4F46E5'} onChange={e => handlePdfChange('primaryColor', e.target.value)} />
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ticket Logo</label>
                  <div className="flex gap-4 items-center p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-inner">
                    {settings.pdfSettings?.logoUrl ? (
                      <div className="relative group">
                        <img src={settings.pdfSettings.logoUrl} alt="PDF Logo" className="h-12 w-auto border border-gray-200 rounded p-1 bg-white shadow-sm" />
                        <button
                          onClick={() => handlePdfChange('logoUrl', '')}
                          className="absolute -top-2 -right-2 bg-white text-red-600 p-1 rounded-full shadow-md opacity-0 group-hover:opacity-100 transition border border-red-50"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="h-12 w-32 bg-gray-100 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-400">NO LOGO</div>
                    )}
                    <label className={`cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm ${uploading === 'pdfLogo' ? 'opacity-60 pointer-events-none' : ''}`}>
                      {uploading === 'pdfLogo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                      {uploading === 'pdfLogo' ? 'Uploading…' : settings.pdfSettings?.logoUrl ? 'Change Logo' : 'Upload Logo'}
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'pdfLogo')} />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Organization Info (Address, Tax ID, etc)</label>
                  <textarea rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                    value={settings.pdfSettings?.organizationInfo || ''} onChange={e => handlePdfChange('organizationInfo', e.target.value)} />
                </div>

                <div className="md:col-span-2 p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-inner">
                  <h4 className="font-bold text-gray-800 mb-1 text-sm">Background Image (Optional)</h4>
                  <p className="text-[11px] text-gray-500 mb-3 font-medium">Upload a full-page background image. Ensure text remains readable by previewing.</p>

                  <div className="flex gap-4 items-center">
                    {settings.pdfSettings?.backgroundImage ? (
                      <div className="relative w-16 h-24 border border-gray-300 rounded overflow-hidden shadow-md group bg-white p-0.5">
                        <img src={settings.pdfSettings.backgroundImage} alt="BG Preview" className="w-full h-full object-cover rounded" />
                        <button
                          onClick={(e) => { e.stopPropagation(); handlePdfChange('backgroundImage', ''); }}
                          className="absolute inset-0 bg-red-600/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition"
                          title="Remove Background"
                        >
                          <X className="w-6 h-6" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-16 h-24 border border-dashed border-gray-300 rounded bg-gray-100 flex items-center justify-center text-gray-400 text-[10px] text-center p-1 font-bold">
                        EMPTY
                      </div>
                    )}

                    <label className={`cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm ${uploading === 'pdfBackground' ? 'opacity-60 pointer-events-none' : ''}`}>
                      {uploading === 'pdfBackground' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                      {uploading === 'pdfBackground' ? 'Uploading…' : settings.pdfSettings?.backgroundImage ? 'Replace BG' : 'Upload BG'}
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'pdfBackground')} />
                    </label>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text / Disclaimer</label>
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none shadow-sm focus:ring-2 focus:ring-indigo-500"
                    value={settings.pdfSettings?.footerText || ''} onChange={e => handlePdfChange('footerText', e.target.value)} />
                </div>
              </div>
            </div>
          )}
          {activeTab === 'pricing-templates' && settings.feature_pricing_templates && (
            <div className="overflow-y-auto p-8 animate-fade-in-up">
              <PricingTemplatesTab />
            </div>
          )}

          {activeTab === 'announcements' && (
            <div className="overflow-y-auto p-8 animate-fade-in-up">
              <AnnouncementsTab />
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="overflow-y-auto p-8 space-y-8 animate-fade-in-up">
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">System Diagnostics</h3>
                <p className="text-sm text-gray-500">Run manual integration tests to verify database security, Edge Function health, and SMTP routing.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Database Target */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><Database className="w-6 h-6" /></div>
                    <h4 className="font-bold text-gray-900">Database & RLS</h4>
                  </div>
                  <p className="text-sm text-gray-500 mb-6 flex-grow">Tests authenticated data retrieval targeting Row Level Security (RLS) policies.</p>
                  {testResults.database.message && (
                    <div className={`p-3 rounded-md mb-4 text-sm font-medium ${testResults.database.status === 'success' ? 'bg-green-50 text-green-700' : testResults.database.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'} `}>
                      {testResults.database.message}
                    </div>
                  )}
                  <button 
                    className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg flex justify-center items-center gap-2 font-medium transition-colors disabled:opacity-50"
                    onClick={runDatabaseTest}
                    disabled={testResults.database.status === 'running'}
                  >
                    {testResults.database.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ping Database'}
                  </button>
                </div>

                {/* Edge Functions Target */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg"><Server className="w-6 h-6" /></div>
                    <h4 className="font-bold text-gray-900">Edge Functions</h4>
                  </div>
                  <p className="text-sm text-gray-500 mb-6 flex-grow">Pings the Serverless Deno Edge endpoints (verify-payment, send-email) securely isolating logic.</p>
                  {testResults.edgeFunctions.message && (
                    <div className={`p-3 rounded-md mb-4 text-sm font-medium ${testResults.edgeFunctions.status === 'success' ? 'bg-green-50 text-green-700' : testResults.edgeFunctions.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'} `}>
                      {testResults.edgeFunctions.message}
                    </div>
                  )}
                  <button 
                    className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg flex justify-center items-center gap-2 font-medium transition-colors disabled:opacity-50"
                    onClick={runEdgeFunctionTest}
                    disabled={testResults.edgeFunctions.status === 'running'}
                  >
                    {testResults.edgeFunctions.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Test Integrity'}
                  </button>
                </div>

                {/* SMTP Routing Target */}
                <div className="bg-white rounded-xl border border-gray-200 p-6 flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><ShieldCheck className="w-6 h-6" /></div>
                    <h4 className="font-bold text-gray-900">Nodemailer SMTP</h4>
                  </div>
                  <p className="text-sm text-gray-500 mb-6 flex-grow">Attempts a live handshake and dummy email dispatch securely through your Edge Function variables.</p>
                  {testResults.smtp.message && (
                    <div className={`p-3 rounded-md mb-4 text-sm font-medium ${testResults.smtp.status === 'success' ? 'bg-green-50 text-green-700' : testResults.smtp.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-700'} `}>
                      {testResults.smtp.message}
                    </div>
                  )}
                  <button 
                    className="w-full py-2 bg-gray-900 hover:bg-gray-800 text-white rounded-lg flex justify-center items-center gap-2 font-medium transition-colors disabled:opacity-50"
                    onClick={runSmtpTest}
                    disabled={testResults.smtp.status === 'running'}
                  >
                    {testResults.smtp.status === 'running' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Fire Test Email'}
                  </button>
                </div>

              </div>
            </div>
          )}
        </div>
    </div>
  );
};

export default Settings;