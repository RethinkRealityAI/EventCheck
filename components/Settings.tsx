import React, { useState, useEffect } from 'react';
import { Save, CreditCard, Mail, Key, Eye, FileText, Check, Upload, Image as ImageIcon, Send as SendIcon, Users, UserPlus, Menu, PanelLeftClose, PanelLeft, Plus, X } from 'lucide-react';
import { AppSettings, DEFAULT_SETTINGS, Attendee } from '../types';
import { getSettings, saveSettings, getAttendees } from '../services/storageService';
import { sendEmail } from '../services/emailService';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { useNotifications } from './NotificationSystem';
import RichTextEditor from './RichTextEditor';

const Settings: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [activeTab, setActiveTab] = useState<'general' | 'email' | 'pdf'>('general');
  const [previewMode, setPreviewMode] = useState<'ticket' | 'invite'>('ticket');
  const [dummyAttendee, setDummyAttendee] = useState<Attendee | null>(null);
  const [allAttendees, setAllAttendees] = useState<Attendee[]>([]);

  // Platform State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [recipientMode, setRecipientMode] = useState<'manual' | 'all' | 'specific'>('manual');

  // Manual Entry State
  const [manualNameInput, setManualNameInput] = useState('');
  const [manualEmailInput, setManualEmailInput] = useState('');
  const [manualRecipientsList, setManualRecipientsList] = useState<{ name: string, email: string }[]>([]);

  const [selectedAttendeeId, setSelectedAttendeeId] = useState<string>('');
  const [sending, setSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const { showNotification } = useNotifications();

  useEffect(() => {
    const fetch = async () => {
      const settingsData = await getSettings();
      setSettings(settingsData);

      const attendees = await getAttendees();
      setAllAttendees(attendees);
      if (attendees.length > 0) {
        setDummyAttendee(attendees[0]);
        setSelectedAttendeeId(attendees[0].id);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveSettings(settings);
    showNotification('Settings saved successfully', 'success');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'emailHeaderLogo' | 'pdfLogo' | 'pdfBackground') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      if (field === 'emailHeaderLogo') {
        handleChange('emailHeaderLogo', base64);
      } else if (field === 'pdfLogo') {
        handlePdfChange('logoUrl', base64);
      } else if (field === 'pdfBackground') {
        handlePdfChange('backgroundImage', base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const previewHtml = React.useMemo(() => {
    const template = previewMode === 'ticket' ? settings.emailBodyTemplate : settings.emailInvitationBody;
    let manualOverride: Attendee | null = null;
    if (recipientMode === 'manual' && manualRecipientsList.length > 0) {
      manualOverride = {
        ...dummyAttendee!,
        name: manualRecipientsList[0].name || 'Guest',
        email: manualRecipientsList[0].email
      };
    }

    const attendee = manualOverride || dummyAttendee;
    const name = attendee?.name || 'Valued Guest';
    const formTitle = attendee?.formTitle || settings.pdfSettings.eventTitle || 'Event';
    const id = attendee?.id || 'NO-ID';
    const invoiceId = attendee?.invoiceId || 'N/A';
    const amount = (settings.ticketPrice || 0).toString();
    const headerColor = settings.emailHeaderColor || '#f8fafc';
    const footerColor = settings.emailFooterColor || '#f8fafc';

    const body = template
      .replace(/{{name}}/g, name)
      .replace(/{{event}}/g, formTitle)
      .replace(/{{id}}/g, id)
      .replace(/{{invoiceId}}/g, invoiceId)
      .replace(/{{amount}}/g, amount)
      .replace(/{{link}}/g, '#register-link');

    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        ${settings.emailHeaderLogo ? `<div style="background: ${headerColor}; padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb;"><img src="${settings.emailHeaderLogo}" style="max-height: 60px; max-width: 200px;" alt="Logo"/></div>` : `<div style="background: ${headerColor}; padding: 16px; border-bottom: 1px solid #e5e7eb;"></div>`}
        <div style="padding: 32px;">
          ${body}
        </div>
        <div style="background: ${footerColor}; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          ${settings.emailFooterText}
        </div>
      </div>
    `;
  }, [settings, previewMode, recipientMode, manualRecipientsList, dummyAttendee]);

  const generatePreviewHtmlForAttendee = (attendee: Attendee | null) => {
    const template = previewMode === 'ticket' ? settings.emailBodyTemplate : settings.emailInvitationBody;
    const target = attendee || dummyAttendee;

    const name = target?.name || 'Valued Guest';
    const formTitle = target?.formTitle || settings.pdfSettings.eventTitle || 'Event';
    const id = target?.id || 'NO-ID';
    const invoiceId = target?.invoiceId || 'N/A';
    const amount = (settings.ticketPrice || 0).toString();
    const headerColor = settings.emailHeaderColor || '#f8fafc';
    const footerColor = settings.emailFooterColor || '#f8fafc';

    const body = template
      .replace(/{{name}}/g, name)
      .replace(/{{event}}/g, formTitle)
      .replace(/{{id}}/g, id)
      .replace(/{{invoiceId}}/g, invoiceId)
      .replace(/{{amount}}/g, amount)
      .replace(/{{link}}/g, '#register-link');

    return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        ${settings.emailHeaderLogo ? `<div style="background: ${headerColor}; padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb;"><img src="${settings.emailHeaderLogo}" style="max-height: 60px; max-width: 200px;" alt="Logo"/></div>` : `<div style="background: ${headerColor}; padding: 16px; border-bottom: 1px solid #e5e7eb;"></div>`}
        <div style="padding: 32px;">
          ${body}
        </div>
        <div style="background: ${footerColor}; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          ${settings.emailFooterText}
        </div>
      </div>
    `;
  };

  const addManualRecipient = () => {
    if (!manualEmailInput) {
      showNotification('Please enter an email address.', 'warning');
      return;
    }
    if (!manualEmailInput.includes('@')) {
      showNotification('Invalid email address.', 'error');
      return;
    }
    setManualRecipientsList([...manualRecipientsList, { name: manualNameInput.trim(), email: manualEmailInput.trim() }]);
    setManualNameInput('');
    setManualEmailInput('');
  };

  const removeManualRecipient = (idx: number) => {
    setManualRecipientsList(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSendEmail = async () => {
    if (recipientMode === 'manual' && manualRecipientsList.length === 0) {
      showNotification("Please add at least one recipient.", 'warning');
      return;
    }
    if (recipientMode === 'specific' && !selectedAttendeeId) {
      showNotification("Please select an attendee.", 'warning');
      return;
    }

    setSending(true);
    setSendSuccess(null);

    try {
      let targets: { email: string; attendee?: Attendee }[] = [];
      if (recipientMode === 'manual') {
        targets = manualRecipientsList.map(r => ({
          email: r.email,
          attendee: { ...dummyAttendee!, name: r.name || 'Guest', email: r.email }
        }));
      } else if (recipientMode === 'specific') {
        const att = allAttendees.find(a => a.id === selectedAttendeeId);
        if (att) targets = [{ email: att.email, attendee: att }];
      } else if (recipientMode === 'all') {
        targets = allAttendees.map(att => ({ email: att.email, attendee: att }));
      }

      let sentCount = 0;
      const subject = previewMode === 'ticket' ? settings.emailSubject : settings.emailInvitationSubject;

      for (const target of targets) {
        const html = generatePreviewHtmlForAttendee(target.attendee || null);
        await sendEmail(target.email, subject, html);
        sentCount++;
      }

      showNotification(`Successfully sent ${sentCount} email(s).`, 'success');
      if (recipientMode === 'manual') setManualRecipientsList([]);
    } catch (err: any) {
      console.error(err);
      showNotification(`Failed to send email: ${err.message}`, 'error');
    } finally {
      setSending(false);
    }
  };

  const handlePdfPreview = () => {
    if (dummyAttendee) {
      const doc = generateTicketPDF(dummyAttendee, settings);
      window.open(doc.output('bloburl'), '_blank');
    }
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 pb-12 h-screen flex flex-col overflow-hidden">
      <header className="mb-6 flex justify-between items-center pt-6 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Platform Settings</h2>
            <p className="text-gray-500 text-sm font-medium">Configure branding, payments, and communication.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-medium transition-all shadow-md bg-gray-900 hover:bg-gray-800"
        >
          <Save className="w-5 h-5" />
          Save Changes
        </button>
      </header>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden flex flex-1 w-full relative">

        {/* Sidebar Gutter / Persistent Toggle */}
        <div className={`flex flex-col bg-gray-50 border-r border-gray-200 transition-all duration-300 ${isSidebarOpen ? 'w-72' : 'w-14'}`}>
          <div className="p-3 border-b border-gray-100 flex justify-center items-center h-14">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1.5 hover:bg-gray-200 rounded-md text-gray-400 transition-colors"
            >
              {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
            </button>
          </div>

          <div className={`flex-1 overflow-y-auto p-4 space-y-2 ${!isSidebarOpen ? 'hidden md:block' : ''}`}>
            {isSidebarOpen && <span className="block px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">Configuration</span>}

            <button
              onClick={() => setActiveTab('general')}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 font-semibold transition-all ${activeTab === 'general' ? 'bg-white text-indigo-600 shadow-sm border border-gray-100' : 'text-gray-600 hover:bg-white/60'}`}
            >
              <CreditCard className="w-5 h-5 flex-shrink-0" /> {isSidebarOpen && <span className="truncate">General & Payment</span>}
            </button>

            <button
              onClick={() => setActiveTab('email')}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 font-semibold transition-all ${activeTab === 'email' ? 'bg-white text-indigo-600 shadow-sm border border-gray-100' : 'text-gray-600 hover:bg-white/60'}`}
            >
              <Mail className="w-5 h-5 flex-shrink-0" /> {isSidebarOpen && <span className="truncate">Email Templates</span>}
            </button>

            <button
              onClick={() => setActiveTab('pdf')}
              className={`w-full text-left px-4 py-3 rounded-xl flex items-center gap-3 font-semibold transition-all ${activeTab === 'pdf' ? 'bg-white text-indigo-600 shadow-sm border border-gray-100' : 'text-gray-600 hover:bg-white/60'}`}
            >
              <FileText className="w-5 h-5 flex-shrink-0" /> {isSidebarOpen && <span className="truncate">PDF Ticket</span>}
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
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-0 h-full">
              <div className="xl:col-span-7 flex flex-col gap-8 overflow-y-auto pr-2 p-6 h-full min-h-0">
                {/* Send Email Panel */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex-shrink-0">
                  <h3 className="font-bold text-indigo-900 mb-3 flex items-center gap-2">
                    <SendIcon className="w-4 h-4" /> Send {previewMode === 'ticket' ? 'Ticket' : 'Invitation'} Email
                  </h3>

                  <div className="flex gap-2 mb-4 bg-white p-1 rounded-lg border border-indigo-100">
                    <button onClick={() => setRecipientMode('manual')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${recipientMode === 'manual' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                      <UserPlus className="w-3 h-3 inline mr-1" /> Manual
                    </button>
                    <button onClick={() => setRecipientMode('specific')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${recipientMode === 'specific' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                      <Users className="w-3 h-3 inline mr-1" /> Attendee
                    </button>
                    <button onClick={() => setRecipientMode('all')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${recipientMode === 'all' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-50'}`}>
                      <Users className="w-3 h-3 inline mr-1" /> All ({allAttendees.length})
                    </button>
                  </div>

                  <div className="space-y-3">
                    {recipientMode === 'manual' && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Recipient Name</label>
                            <input
                              type="text"
                              placeholder="E.g. John Doe"
                              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm"
                              value={manualNameInput}
                              onChange={e => setManualNameInput(e.target.value)}
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-600 mb-1">Email Address *</label>
                            <input
                              type="email"
                              placeholder="E.g. john@example.com"
                              className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shadow-sm"
                              value={manualEmailInput}
                              onChange={e => setManualEmailInput(e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && addManualRecipient()}
                            />
                          </div>
                        </div>
                        <button onClick={addManualRecipient} className="w-full flex items-center justify-center gap-2 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 py-2 rounded-lg transition font-medium text-sm shadow-sm">
                          <Plus className="w-4 h-4" /> Add Recipient
                        </button>
                        {manualRecipientsList.length > 0 ? (
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-white border border-gray-100 rounded-lg">
                            {manualRecipientsList.map((r, i) => (
                              <div key={i} className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-full text-xs border border-indigo-100 shadow-sm font-medium">
                                <span>{r.name || r.email}</span>
                                {r.name && <span className="opacity-60 text-[10px]">&lt;{r.email}&gt;</span>}
                                <button onClick={() => removeManualRecipient(i)} className="hover:text-red-500 ml-1 hover:bg-white rounded-full p-0.5"><X className="w-3 h-3" /></button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 italic text-center py-2">No recipients added yet.</p>
                        )}
                      </div>
                    )}

                    {recipientMode === 'specific' && (
                      <select
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 bg-white shadow-sm"
                        value={selectedAttendeeId}
                        onChange={e => setSelectedAttendeeId(e.target.value)}
                      >
                        <option value="">Select an attendee...</option>
                        {allAttendees.map(a => (
                          <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
                        ))}
                      </select>
                    )}

                    {recipientMode === 'all' && (
                      <div className="text-xs text-indigo-600 font-medium bg-white p-3 rounded-lg border border-indigo-100">
                        <span className="font-bold">Warning:</span> This will send emails to all {allAttendees.length} registered attendees.
                      </div>
                    )}

                    <button
                      onClick={handleSendEmail}
                      disabled={sending}
                      className={`w-full py-2.5 rounded-lg font-bold text-sm shadow-sm transition flex items-center justify-center gap-2 ${sending ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'}`}
                    >
                      {sending ? 'Sending...' : 'Send Now'}
                      {!sending && <SendIcon className="w-3 h-3" />}
                    </button>
                  </div>
                </div>

                {/* Email Template Editor */}
                <div className="space-y-4 pb-12">
                  <div className="flex gap-2 p-1 bg-gray-100 rounded-lg w-fit">
                    <button
                      onClick={() => setPreviewMode('ticket')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${previewMode === 'ticket' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Ticket Confirmation
                    </button>
                    <button
                      onClick={() => setPreviewMode('invite')}
                      className={`px-4 py-2 text-sm font-medium rounded-lg transition ${previewMode === 'invite' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      Invitation / Marketing
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
                    <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      value={previewMode === 'ticket' ? settings.emailSubject : settings.emailInvitationSubject}
                      onChange={e => handleChange(previewMode === 'ticket' ? 'emailSubject' : 'emailInvitationSubject', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="md:col-span-2">
                      <label className="block text-sm font-bold text-gray-700 mb-2">Header Image</label>
                      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center p-4 border border-gray-200 rounded-xl bg-gray-50/50 shadow-inner">
                        {settings.emailHeaderLogo ? (
                          <div className="relative group w-full sm:w-auto">
                            <div className="h-16 px-6 bg-white border border-gray-200 rounded-lg flex items-center justify-center overflow-hidden shadow-sm">
                              <img src={settings.emailHeaderLogo} alt="Header" className="max-h-12 w-auto object-contain" />
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleChange('emailHeaderLogo', ''); }}
                              className="absolute -top-2 -right-2 bg-white text-red-600 p-1.5 rounded-full shadow-md hover:bg-red-50 border border-red-100 transition"
                              title="Remove Logo"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="h-16 w-32 bg-gray-100 border border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400 font-medium">
                            No Logo
                          </div>
                        )}
                        <label className="cursor-pointer">
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm font-bold shadow-sm transition">
                            <Upload className="w-4 h-4" />
                            <span>{settings.emailHeaderLogo ? 'Replace' : 'Upload Logo'}</span>
                          </div>
                          <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'emailHeaderLogo')} />
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Header Background</label>
                      <div className="flex gap-2">
                        <input type="color" className="h-9 w-9 rounded border border-gray-300 p-0.5 cursor-pointer"
                          value={settings.emailHeaderColor} onChange={e => handleChange('emailHeaderColor', e.target.value)} />
                        <input type="text" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none uppercase"
                          value={settings.emailHeaderColor} onChange={e => handleChange('emailHeaderColor', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Footer Background</label>
                      <div className="flex gap-2">
                        <input type="color" className="h-9 w-9 rounded border border-gray-300 p-0.5 cursor-pointer"
                          value={settings.emailFooterColor} onChange={e => handleChange('emailFooterColor', e.target.value)} />
                        <input type="text" className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none uppercase"
                          value={settings.emailFooterColor} onChange={e => handleChange('emailFooterColor', e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Body Content</label>
                    <RichTextEditor
                      value={previewMode === 'ticket' ? settings.emailBodyTemplate : settings.emailInvitationBody}
                      onChange={(val) => handleChange(previewMode === 'ticket' ? 'emailBodyTemplate' : 'emailInvitationBody', val)}
                      className="flex-1 min-h-[300px]"
                      placeholder="Draft your email content here..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Footer Text</label>
                    <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                      value={settings.emailFooterText} onChange={e => handleChange('emailFooterText', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Preview Column */}
              <div className="xl:col-span-5 bg-gray-50 border-l border-gray-200 p-8 flex flex-col items-center h-full overflow-hidden">
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-6 flex items-center gap-2 w-full">
                  <Eye className="w-4 h-4" /> Live Preview
                </h4>
                <div className="w-full flex-1 overflow-y-auto custom-scrollbar flex justify-center pb-8 p-1">
                  <div className="w-full max-w-[600px] h-fit">
                    <div
                      className="w-full bg-white shadow-2xl rounded-xl overflow-hidden border border-gray-200"
                      style={{ transform: 'none', transition: 'none' }} // Prevent jumping
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'pdf' && (
            <div className="space-y-6 animate-fade-in-up p-4">
              <div className="flex justify-between items-start">
                <h3 className="text-lg font-bold text-gray-900">PDF Ticket Customization</h3>
                <button onClick={handlePdfPreview} className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 transition shadow-sm border border-indigo-100">
                  <Eye className="w-4 h-4" /> Preview PDF
                </button>
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
                    <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm">
                      <ImageIcon className="w-4 h-4" /> {settings.pdfSettings?.logoUrl ? 'Change Logo' : 'Upload Logo'}
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

                    <label className="cursor-pointer bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition shadow-sm">
                      <Upload className="w-4 h-4" /> {settings.pdfSettings?.backgroundImage ? 'Replace BG' : 'Upload BG'}
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
        </div>
      </div>
    </div>
  );
};

export default Settings;