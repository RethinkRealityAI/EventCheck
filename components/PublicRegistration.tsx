import React, { useState, useEffect } from 'react';
import { getFormById, getSettings, saveAttendee } from '../services/storageService';
import { FormField, AppSettings, Attendee, Form } from '../types';
import { Loader2, Check, AlertCircle, Download, Calendar, Tag, CreditCard, ArrowRight, X, Eye, MapPin } from 'lucide-react';
import { useNotifications } from './NotificationSystem';
import { useParams } from 'react-router-dom';
import { generateTicketPDF } from '../utils/pdfGenerator';
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

const PublicRegistration = () => {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [generatedTicket, setGeneratedTicket] = useState<Attendee | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const { showNotification } = useNotifications();

  // Ticket / Payment State
  // Map itemId -> quantity
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string, value: number, type: 'percent' | 'fixed' } | null>(null);

  const [paymentTotal, setPaymentTotal] = useState(0);

  // Donation State (seat-based — donating extra tickets for others)
  const [donateOption, setDonateOption] = useState('no');
  const [donatedSeats, setDonatedSeats] = useState(0);

  // Guest State
  const [guests, setGuests] = useState<Array<{ name: string, email: string, dietary: string }>>([]);

  useEffect(() => {
    const fetch = async () => {
      if (formId) {
        const formData = await getFormById(formId);
        setForm(formData || null);
      }
      const settingsData = await getSettings();
      setSettings(settingsData);
    };
    fetch();
  }, [formId]);

  const ticketField = form?.fields.find(f => f.type === 'ticket');

  // Compute ticket subtotal separately for display on payment page
  const ticketSubtotal = (() => {
    if (!ticketField?.ticketConfig) return 0;
    let subtotal = 0;
    ticketField.ticketConfig.items.forEach(item => {
      const qty = ticketQuantities[item.id] || 0;
      subtotal += item.price * qty;
    });
    let discount = 0;
    if (appliedPromo) {
      discount = appliedPromo.type === 'percent'
        ? subtotal * (appliedPromo.value / 100)
        : appliedPromo.value;
    }
    return Math.max(0, subtotal - discount);
  })();

  useEffect(() => {
    setPaymentTotal(ticketSubtotal);
  }, [ticketSubtotal]);

  // Resize guest array when ticket quantities change
  useEffect(() => {
    if (!ticketField?.ticketConfig) return;
    const totalTickets: number = (Object.values(ticketQuantities) as number[]).reduce((a, b) => a + b, 0);
    setGuests(prev => {
      if (prev.length === totalTickets) return prev;
      const newGuests = [...prev];
      if (newGuests.length < totalTickets) {
        for (let i = newGuests.length; i < totalTickets; i++) {
          newGuests.push({ name: '', email: '', dietary: '' });
        }
      } else {
        newGuests.length = totalTickets;
      }
      return newGuests;
    });
  }, [ticketField, ticketQuantities]);

  const isVisible = (field: FormField) => {
    if (!field.conditional?.enabled || !field.conditional.fieldId) return true;
    const targetValue = answers[field.conditional.fieldId];
    if (targetValue === undefined || targetValue === null) return false;
    if (Array.isArray(targetValue)) {
      return targetValue.includes(field.conditional.value);
    }
    // Handle boolean comparisons where value might be 'true'/'false' string
    if (typeof targetValue === 'boolean') {
      return String(targetValue) === field.conditional.value;
    }
    return String(targetValue) === field.conditional.value;
  };

  const handleInputChange = (fieldId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleQuantityChange = (itemId: string, qty: number) => {
    setTicketQuantities(prev => ({ ...prev, [itemId]: qty }));
  };

  const applyPromo = () => {
    if (!ticketField?.ticketConfig?.promoCodes) return;
    const found = ticketField.ticketConfig.promoCodes.find(p => p.code.toLowerCase() === promoCode.toLowerCase());
    if (found) {
      setAppliedPromo(found);
      setPromoCode(''); // Clear input
      showNotification("Promo code applied successfully", 'success');
    } else {
      showNotification("Invalid promo code", 'error');
    }
  };

  const validate = () => {
    if (!form) return false;
    for (const field of form.fields) {
      if (isVisible(field) && field.required && !answers[field.id] && field.type !== 'ticket') {
        setError(`Please fill in ${field.label}`);
        return false;
      }
      if (isVisible(field) && field.type === 'text' && field.validation === 'int' && answers[field.id]) {
        if (!/^\d+$/.test(answers[field.id])) {
          setError(`${field.label} must be a whole number.`);
          return false;
        }
      }
    }

    if (ticketField && ticketField.required) {
      const totalQty = Object.values(ticketQuantities).reduce((a: number, b: number) => a + b, 0);
      if (totalQty === 0) {
        setError("Please select at least one ticket.");
        return false;
      }
    }

    setError('');
    return true;
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Check if ticket field present
    if (ticketField && paymentTotal > 0) {
      setStep('payment');
    } else {
      finalizeRegistration('free');
    }
  };

  const finalizeRegistration = async (paymentStatus: 'paid' | 'free', transactionId?: string, paymentAmount?: string) => {
    if (!form) return;
    setLoading(true);

    // Generate a valid UUID for Supabase
    const submissionId = crypto.randomUUID();
    const invoiceId = `INV-${Math.random().toString(10).substr(2, 6)}`;

    const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
    const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));

    // Construct Ticket Summary String
    let ticketTypeSummary = paymentStatus === 'paid' ? 'Paid Admission' : 'General Admission';
    if (ticketField && ticketField.ticketConfig) {
      const parts: string[] = [];
      ticketField.ticketConfig.items.forEach(item => {
        const qty = ticketQuantities[item.id] || 0;
        if (qty > 0) parts.push(`${item.name} x${qty}`);
      });
      if (parts.length > 0) ticketTypeSummary = parts.join(', ');
    }

    // Purchaser name/email from form fields (always preserved as primary)
    const purchaserName = nameField ? answers[nameField.id] : 'Guest';
    const purchaserEmail = emailField ? answers[emailField.id] : 'unknown@example.com';

    const newAttendee: Attendee = {
      id: submissionId,
      formId: form.id,
      formTitle: form.title,
      name: purchaserName,
      email: purchaserEmail,
      ticketType: ticketTypeSummary,
      registeredAt: new Date().toISOString(),
      answers: answers,
      paymentStatus,
      invoiceId,
      transactionId,
      paymentAmount,
      isPrimary: true,
      qrPayload: JSON.stringify({ id: submissionId, invoiceId, formId: form.id, action: 'checkin' })
    };

    // Add dietary preferences for the primary attendee from guest slot 0
    if (ticketField?.ticketConfig?.enableGuestDetails && guests.length > 0 && guests[0].dietary) {
      newAttendee.dietaryPreferences = guests[0].dietary;
    }

    // Add Donated Seats Info
    if (ticketField?.ticketConfig?.enableDonations && donatedSeats > 0) {
      newAttendee.donatedSeats = donatedSeats;
    }

    await saveAttendee(newAttendee);
    setGeneratedTicket(newAttendee);

    // Save Guests
    if (ticketField?.ticketConfig?.enableGuestDetails && guests.length > 1) {
      const guestPromises = guests.slice(1).map(async (g, index) => {
        const guestId = crypto.randomUUID();
        const guestAttendee: Attendee = {
          id: guestId,
          formId: form.id!,
          formTitle: form.title!,
          name: g.name || `Guest ${index + 2}`,
          email: g.email || 'unknown@example.com',
          dietaryPreferences: g.dietary,
          ticketType: 'Guest Ticket',
          registeredAt: new Date().toISOString(),
          answers: {},
          paymentStatus,
          paymentAmount: '0',
          invoiceId,
          transactionId,
          isPrimary: false,
          primaryAttendeeId: newAttendee.id,
          qrPayload: JSON.stringify({ id: guestId, invoiceId, formId: form.id, action: 'checkin' })
        };
        return saveAttendee(guestAttendee);
      });
      await Promise.all(guestPromises);
    }

    setLoading(false);
    setStep('success');

    // Generate Preview URL for Modal (Primary Ticket)
    if (settings) {
      const doc = generateTicketPDF(newAttendee, settings, form);
      setPreviewPdfUrl(doc.output('bloburl').toString());
    }
  };

  // PayPal Payment Handler
  const onPayPalApprove = async (data: any, actions: any) => {
    return actions.order.capture().then((details: any) => {
      const transactionId = details.purchase_units[0].payments.captures[0].id;
      const amountValue = details.purchase_units[0].payments.captures[0].amount.value;
      const amountCurrency = details.purchase_units[0].payments.captures[0].amount.currency_code;
      finalizeRegistration('paid', transactionId, `${amountValue} ${amountCurrency}`);
    });
  };

  // Safely access env with fallback
  const getEnvVar = (name: string): string => {
    try {
      return (import.meta as any).env[name] || "";
    } catch (e) {
      return "";
    }
  };

  const paypalClientId = getEnvVar('VITE_PAYPAL_CLIENT_ID') || settings?.paypalClientId || "";

  const downloadPdf = () => {
    if (generatedTicket && settings) {
      const doc = generateTicketPDF(generatedTicket, settings, form);
      doc.save(`${generatedTicket.name}_Ticket.pdf`);
    }
  };

  if (!form || !settings) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-gray-500">Form not found or unavailable.</p>
    </div>
  );

  if (form.status === 'closed') return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg text-center">
        <h1 className="text-xl font-bold mb-2">{form.title}</h1>
        <p className="text-red-500">This form is currently closed for new registrations.</p>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center relative"
      style={{
        backgroundColor: form.settings?.formBackgroundColor || '#F3F4F6',
        backgroundImage: form.settings?.formBackgroundImage ? `url(${form.settings.formBackgroundImage})` : 'none',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Overlay to ensure readability if there's a background image */}
      {form.settings?.formBackgroundImage && (
        <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <div className="text-center">
              <h3 className="text-xl font-bold text-gray-900">Processing...</h3>
              <p className="text-gray-500">Please wait while we complete your registration.</p>
            </div>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div className="max-w-xl w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden relative z-10 border border-white/20">
          <div
            className="px-8 py-8 text-center"
            style={{ backgroundColor: form.settings?.formHeaderColor || '#4F46E5' }}
          >
            <h1
              className="text-3xl font-black mb-2"
              style={{ color: form.settings?.formTitleColor || '#FFFFFF' }}
            >
              {form.settings?.formTitle || form.title}
            </h1>
            <p
              className="opacity-90 font-medium"
              style={{ color: form.settings?.formDescriptionColor || '#FFFFFF' }}
            >
              {form.description}
            </p>
          </div>

          <form onSubmit={submitForm} className="p-8 space-y-6">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle className="w-4 h-4" /> {error}
              </div>
            )}

            {form.fields.map(field => isVisible(field) && (
              <div key={field.id}>
                {field.type !== 'ticket' && (
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                )}

                {field.type === 'textarea' ? (
                  <textarea
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder={field.placeholder}
                    value={answers[field.id] || ''}
                    onChange={e => handleInputChange(field.id, e.target.value)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    value={answers[field.id] || ''}
                    onChange={e => handleInputChange(field.id, e.target.value)}
                  >
                    <option value="">Select an option</option>
                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : field.type === 'ticket' ? (
                  <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                    <div className="mb-4 pb-2 border-b border-gray-200">
                      <span className="font-bold text-gray-900 block text-lg">{field.label}</span>
                      <span className="text-xs text-gray-500">Select your tickets below</span>
                    </div>

                    <div className="space-y-4 mb-6">
                      {field.ticketConfig?.items.map(item => (
                        <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-100 shadow-sm">
                          <div>
                            <div className="font-bold text-gray-800">{item.name}</div>
                            <div className="text-xs text-gray-500">{item.price > 0 ? `${item.price} ${field.ticketConfig?.currency}` : 'Free'}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-400 uppercase font-bold">Qty</label>
                            <select
                              className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm focus:ring-indigo-500"
                              value={ticketQuantities[item.id] || 0}
                              onChange={e => handleQuantityChange(item.id, parseInt(e.target.value))}
                            >
                              {[...Array((item.maxPerOrder || 5) + 1)].map((_, i) => (
                                <option key={i} value={i}>{i}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Promo Code */}
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text" placeholder="Promo Code"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value)}
                      />
                      <button
                        type="button" onClick={applyPromo}
                        className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                      >
                        Apply
                      </button>
                    </div>
                    {appliedPromo && (
                      <div className="text-xs text-green-600 flex items-center gap-1 mb-2">
                        <Tag className="w-3 h-3" /> Code applied: {appliedPromo.code}
                      </div>
                    )}

                    {/* Donation and Guest Sections */}
                    {field.ticketConfig?.enableDonations && (
                      <div className="mb-4 pt-4 border-t border-gray-200">
                        <div className="font-bold text-gray-800 mb-1">Donate Extra Seats</div>
                        <p className="text-xs text-gray-500 mb-3">Would you like to purchase additional seats and donate them so others can attend?</p>
                        <div className="flex gap-4 mb-3">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" checked={donateOption === 'no'} onChange={() => { setDonateOption('no'); setDonatedSeats(0); }} className="text-indigo-600 focus:ring-indigo-500" />
                            <span className="text-sm">No thanks</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" checked={donateOption === 'yes'} onChange={() => setDonateOption('yes')} className="text-indigo-600 focus:ring-indigo-500" />
                            <span className="text-sm">Yes, I'd like to donate seats</span>
                          </label>
                        </div>

                        {donateOption === 'yes' && (
                          <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200">
                            <label className="block text-xs font-bold text-emerald-700 uppercase mb-1">How many extra seats would you like to donate?</label>
                            <select
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                              value={donatedSeats}
                              onChange={e => setDonatedSeats(Math.max(0, parseInt(e.target.value) || 0))}
                            >
                              {[...Array(11)].map((_, i) => <option key={i} value={i}>{i} seat{i !== 1 ? 's' : ''}</option>)}
                            </select>
                            <p className="text-[11px] text-emerald-600 mt-2">These seats will be made available for individuals who may not otherwise be able to attend.</p>
                          </div>
                        )}
                      </div>
                    )}

                    {field.ticketConfig?.enableGuestDetails && guests.length > 0 && (
                      <div className="mb-4 pt-4 border-t border-gray-200">
                        <div className="font-bold text-gray-800 mb-2">Guest Details</div>
                        <p className="text-xs text-gray-500 mb-4">Please provide details for each ticket holder.</p>

                        <div className="space-y-3">
                          {guests.map((g, i) => (
                            <div key={i} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                              <div className="text-xs font-bold text-gray-400 uppercase mb-2">Ticket #{i + 1}</div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                <input
                                  type="text" placeholder="Guest Name"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                  value={g.name}
                                  onChange={e => {
                                    const newGuests = [...guests];
                                    newGuests[i].name = e.target.value;
                                    setGuests(newGuests);
                                  }}
                                />
                                <input
                                  type="email" placeholder="Guest Email"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                  value={g.email}
                                  onChange={e => {
                                    const newGuests = [...guests];
                                    newGuests[i].email = e.target.value;
                                    setGuests(newGuests);
                                  }}
                                />
                              </div>
                              <input
                                type="text" placeholder="Dietary Restrictions (Optional)"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                value={g.dietary}
                                onChange={e => {
                                  const newGuests = [...guests];
                                  newGuests[i].dietary = e.target.value;
                                  setGuests(newGuests);
                                }}
                              />
                              {i === 0 && (
                                <button type="button" onClick={() => {
                                  const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
                                  const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
                                  const newGuests = [...guests];
                                  if (nameField) newGuests[0].name = answers[nameField.id] || '';
                                  if (emailField) newGuests[0].email = answers[emailField.id] || '';
                                  setGuests(newGuests);
                                }} className="text-xs text-indigo-600 font-bold mt-2 hover:underline">
                                  Same as Purchaser
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-sm font-bold text-gray-700">Total:</span>
                      <span className="text-xl font-bold text-indigo-700">
                        {paymentTotal.toFixed(2)} {field.ticketConfig?.currency}
                      </span>
                    </div>
                  </div>
                ) : field.type === 'radio' ? (
                  <div className="space-y-2 mt-2">
                    {field.options?.map(opt => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={field.id}
                          checked={answers[field.id] === opt}
                          onChange={() => handleInputChange(field.id, opt)}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : field.type === 'checkbox' ? (
                  <div className="space-y-2 mt-2">
                    {field.options?.map(opt => (
                      <label key={opt} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={answers[field.id]?.includes(opt)}
                          onChange={(e) => {
                            const current = answers[field.id] || [];
                            if (e.target.checked) handleInputChange(field.id, [...current, opt]);
                            else handleInputChange(field.id, current.filter((v: string) => v !== opt));
                          }}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : field.type === 'boolean' ? (
                  <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition cursor-pointer"
                    onClick={() => handleInputChange(field.id, !answers[field.id])}
                  >
                    <span className="text-sm font-medium text-gray-700">{field.label}</span>
                    <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${answers[field.id] ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${answers[field.id] ? 'translate-x-6' : ''}`}></div>
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    {field.type === 'address' && <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />}
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                      inputMode={field.type === 'text' && field.validation === 'int' ? 'numeric' : undefined}
                      className={`w-full ${field.type === 'address' ? 'pl-10' : 'px-3'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition`}
                      placeholder={field.placeholder}
                      value={answers[field.id] || ''}
                      onChange={e => handleInputChange(field.id, e.target.value)}
                    />
                  </div>
                )}
              </div>
            ))}

            <div className="pt-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 text-white rounded-xl font-black uppercase tracking-widest transition shadow-lg flex justify-center items-center gap-2 transform hover:scale-[1.02] active:scale-95 disabled:opacity-70 disabled:grayscale disabled:cursor-not-allowed"
                style={{ backgroundColor: form.settings?.formAccentColor || '#4F46E5' }}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (ticketField && paymentTotal > 0) ? (
                  <>Proceed to Payment <ArrowRight className="w-5 h-5" /></>
                ) : (form.settings?.submitButtonText || 'Register Now')}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'payment' && (
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Secure Payment</h2>
          <p className="text-gray-500 mb-8">Complete your purchase to receive your ticket.</p>

          <div className="bg-gray-50 p-4 rounded-xl mb-8 border border-gray-100">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-600">Ticket(s) Subtotal</span>
              <span className="font-medium text-gray-900">{ticketSubtotal.toFixed(2)} {ticketField?.ticketConfig?.currency}</span>
            </div>
            {appliedPromo && (
              <div className="flex justify-between items-center text-sm text-green-600 border-t border-gray-200 pt-2 mt-2">
                <span>Promo ({appliedPromo.code})</span>
                <span>Applied</span>
              </div>
            )}
            {donatedSeats > 0 && (
              <div className="flex justify-between items-center text-sm text-emerald-600 border-t border-gray-200 pt-2 mt-2">
                <span>Donated Seats</span>
                <span>{donatedSeats} seat{donatedSeats !== 1 ? 's' : ''}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-lg font-bold text-indigo-600 border-t border-gray-200 pt-3 mt-3">
              <span>Total Due</span>
              <span>{paymentTotal.toFixed(2)} {ticketField?.ticketConfig?.currency}</span>
            </div>
          </div>

          {paypalClientId ? (
            <div key={`${paypalClientId}-${paymentTotal}`} className="min-h-[150px] flex flex-col gap-2">
              <PayPalScriptProvider options={{
                clientId: paypalClientId,
                currency: ticketField?.ticketConfig?.currency || "USD",
                components: "buttons"
              }}>
                <PayPalButtons
                  style={{
                    layout: "vertical",
                    shape: "rect",
                    tagline: false
                  }}
                  createOrder={(data, actions) => {
                    return actions.order.create({
                      intent: "CAPTURE",
                      purchase_units: [
                        {
                          amount: {
                            currency_code: ticketField?.ticketConfig?.currency || "USD",
                            value: paymentTotal.toFixed(2),
                          }
                        }
                      ],
                      application_context: {
                        shipping_preference: "NO_SHIPPING"
                      }
                    });
                  }}
                  onApprove={onPayPalApprove}
                  onError={(err) => {
                    console.error("PayPal Error:", err);
                    setError("PayPal failed to load. Please verify your Client ID in Settings.");
                  }}
                />
              </PayPalScriptProvider>
              {/* Temporary Debug ID (First 10 chars) */}
              <div className="text-[10px] text-gray-400 mt-2 italic">
                Payment Instance ID: {paypalClientId.substring(0, 10)}...
              </div>
            </div>
          ) : (
            <div className="p-4 bg-amber-50 text-amber-700 rounded-lg text-sm flex flex-col gap-2">
              <AlertCircle className="w-5 h-5" />
              <p className="font-bold">PayPal Configuration Missing</p>
              <p>Please ensure VITE_PAYPAL_CLIENT_ID is set in your .env.local file or provided in the Admin Settings.</p>
            </div>
          )}

          <p className="text-xs text-gray-400 mt-4">Safe and secure payments.</p>
        </div>
      )}

      {step === 'success' && generatedTicket && (
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in-up relative z-10">
          <div
            className="w-full h-48 flex flex-col items-center justify-center text-white"
            style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-lg animate-bounce-slow"
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}
            >
              <Check className="w-10 h-10 text-white" style={{ color: form.settings?.successIconColor || '#10B981' }} />
            </div>
            <h3 className="text-3xl font-black px-4" style={{ color: form.settings?.successIconColor || '#10B981' }}>
              {form.settings?.successTitle || 'Registration Confirmed!'}
            </h3>
          </div>

          <div className="p-8 text-center">

            {/* Custom Thank You Message */}
            {form.thankYouMessage ? (
              <div
                className="prose prose-sm max-w-none text-gray-600 mb-6"
                dangerouslySetInnerHTML={{ __html: form.thankYouMessage }}
              />
            ) : (
              <>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">You're going!</h2>
                <p className="text-gray-500 mb-6">A confirmation email with your ticket has been sent to <span className="font-semibold">{generatedTicket.email}</span>.</p>
              </>
            )}

            {(form.settings?.showQrOnSuccess !== false) && (
              <div
                className="border border-gray-200 rounded-2xl p-8 shadow-md mb-8 max-w-sm mx-auto relative overflow-hidden transform transition hover:scale-[1.02] duration-300"
                style={{ backgroundColor: form.settings?.successFooterColor || '#F9FAFB' }}
              >
                <div
                  className="absolute top-0 left-0 w-full h-1"
                  style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5', opacity: 0.3 }}
                ></div>
                <h4 className="font-bold text-xl text-gray-900 mb-1">{form.title}</h4>
                <p className="text-xs text-gray-500 mb-6 uppercase tracking-widest font-semibold">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>

                <div className="bg-white p-3 rounded-2xl inline-block mb-6 shadow-sm border border-gray-100">
                  {/* We simulate the QR here like in preview */}
                  <div className="w-40 h-40 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Check className="w-12 h-12 text-gray-300" />
                  </div>
                </div>

                <div className="text-sm font-mono bg-white p-3 rounded-xl border border-gray-200 text-gray-700 mb-6 flex justify-between items-center">
                  <span className="text-gray-400 text-[10px] uppercase font-bold">Ticket ID</span>
                  <span className="font-bold">#{generatedTicket.id}</span>
                </div>

                {(form.settings?.showTicketButtonOnSuccess !== false) && (
                  <button
                    onClick={downloadPdf}
                    className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition transform hover:scale-[1.02]"
                    style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
                  >
                    <Download className="w-5 h-5 inline mr-2" /> Download PDF Ticket
                  </button>
                )}
              </div>
            )}

            {/* Fallback Buttons if QR is hidden */}
            {form.settings?.showQrOnSuccess === false && (
              <div className="flex flex-col gap-3 mb-8">
                {form.settings?.showTicketButtonOnSuccess !== false && (
                  <button
                    onClick={downloadPdf}
                    className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition"
                    style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
                  >
                    <Download className="w-5 h-5 inline mr-2" /> Download PDF Ticket
                  </button>
                )}
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="w-full py-4 bg-gray-100 text-gray-700 rounded-xl text-sm font-black uppercase tracking-widest transition"
                >
                  <Eye className="w-4 h-4 inline mr-2" /> View Ticket Preview
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => window.location.reload()}
            className="text-gray-500 text-sm font-medium hover:text-gray-900 underline"
          >
            Start New Registration
          </button>
        </div>
      )}

      {/* PDF Preview Modal */}
      {showPreviewModal && previewPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col relative">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="font-bold text-lg">Ticket Preview</h3>
              <button onClick={() => setShowPreviewModal(false)} className="text-gray-500 hover:text-gray-900">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="flex-1 bg-gray-100 p-4 overflow-hidden">
              <iframe src={previewPdfUrl} className="w-full h-full rounded-lg border border-gray-300" title="Ticket PDF"></iframe>
            </div>
            <div className="p-4 border-t flex justify-end gap-3">
              <button onClick={() => setShowPreviewModal(false)} className="px-4 py-2 text-gray-600">Close</button>
              <button onClick={downloadPdf} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium flex items-center gap-2">
                <Download className="w-4 h-4" /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicRegistration;