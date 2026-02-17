import React, { useState, useEffect } from 'react';
import { Ticket, CreditCard, Tag, Eye, AlertCircle, ArrowRight, Loader2, Check, RefreshCw, Download, MapPin, CheckSquare } from 'lucide-react';
import QRCode from 'react-qr-code';
import { FormField, Form, Attendee } from '../types';
import { saveAttendee } from '../services/storageService';
import { useNotifications } from './NotificationSystem';

interface FormPreviewProps {
    form: Form;
}

const FormPreview: React.FC<FormPreviewProps> = ({ form }) => {
    const { showNotification } = useNotifications();

    // Preview interaction state
    const [previewStep, setPreviewStep] = useState<'form' | 'payment' | 'success'>('form');
    const [previewAnswers, setPreviewAnswers] = useState<Record<string, any>>({});
    const [previewTicketQuantities, setPreviewTicketQuantities] = useState<Record<string, number>>({});
    const [previewDonateOption, setPreviewDonateOption] = useState<'no' | 'table' | 'seats'>('no');
    const [previewDonatedSeats, setPreviewDonatedSeats] = useState(0);
    const [previewDonatedTables, setPreviewDonatedTables] = useState(0);
    const [previewPromoCode, setPreviewPromoCode] = useState('');
    const [previewAppliedPromo, setPreviewAppliedPromo] = useState<{ code: string, value: number, type: 'percent' | 'fixed' } | null>(null);
    const [previewSkipGuestDetails, setPreviewSkipGuestDetails] = useState(false);
    const [previewIsFirstGuestPurchaser, setPreviewIsFirstGuestPurchaser] = useState(true);
    const [previewGuests, setPreviewGuests] = useState<Array<{ name: string, email: string, dietary: string }>>([]);
    const [previewPaymentTotal, setPreviewPaymentTotal] = useState<number>(0);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [lastGeneratedAttendee, setLastGeneratedAttendee] = useState<Attendee | null>(null);

    // Recalculate totals and guests whenever ticket quantities, form, or promo changes
    useEffect(() => {
        const ticketField = form.fields.find(f => f.type === 'ticket');
        if (ticketField && ticketField.ticketConfig) {
            let subtotal = 0;
            let totalSeats = 0;
            ticketField.ticketConfig.items.forEach(item => {
                const qty = previewTicketQuantities[item.id] || 0;
                subtotal += (item.price * qty);
                totalSeats += (qty * (item.seats || 1));
            });
            // Apply promo discount
            let discount = 0;
            if (previewAppliedPromo) {
                discount = previewAppliedPromo.type === 'percent'
                    ? subtotal * (previewAppliedPromo.value / 100)
                    : previewAppliedPromo.value;
            }
            setPreviewPaymentTotal(Math.max(0, subtotal - discount));

            // Update preview guests array size
            setPreviewGuests(prev => {
                if (prev.length === totalSeats) {
                    // Sync first guest if enabled and length matches
                    if (previewIsFirstGuestPurchaser && prev.length > 0) {
                        const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
                        const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
                        // Only update if different
                        if (nameField && prev[0].name !== (previewAnswers[nameField.id] || '')) {
                            const next = [...prev];
                            next[0].name = previewAnswers[nameField.id] || '';
                            if (emailField) next[0].email = previewAnswers[emailField.id] || '';
                            return next;
                        }
                    }
                    return prev;
                }

                const next = [...prev];
                if (next.length < totalSeats) {
                    for (let i = next.length; i < totalSeats; i++) {
                        next.push({ name: '', email: '', dietary: 'no' });
                    }
                } else {
                    next.length = totalSeats;
                }

                // Sync first guest with purchaser details if enabled
                if (previewIsFirstGuestPurchaser && next.length > 0) {
                    const nameField = form.fields.find(f => f.type === 'text' || f.label.toLowerCase().includes('name'));
                    const emailField = form.fields.find(f => f.type === 'email' || f.label.toLowerCase().includes('email'));
                    if (nameField) next[0].name = previewAnswers[nameField.id] || '';
                    if (emailField) next[0].email = previewAnswers[emailField.id] || '';
                }
                return next;
            });
        }
    }, [previewTicketQuantities, form, previewAppliedPromo, previewIsFirstGuestPurchaser, previewAnswers]);

    // --- Preview Logic ---
    const isFieldVisibleInPreview = (field: FormField) => {
        if (!field.conditional?.enabled || !field.conditional.fieldId) return true;
        const targetValue = previewAnswers[field.conditional.fieldId];
        if (targetValue === undefined || targetValue === null) return false;
        if (Array.isArray(targetValue)) {
            return targetValue.includes(field.conditional.value);
        }
        if (typeof targetValue === 'boolean') {
            return String(targetValue) === field.conditional.value;
        }
        return String(targetValue) === field.conditional.value;
    };

    const handlePreviewSubmit = (e: React.FormEvent) => {
        e.preventDefault();

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

    const applyPreviewPromo = () => {
        const ticketField = form.fields.find(f => f.type === 'ticket');
        if (!ticketField?.ticketConfig?.promoCodes) return;
        const found = ticketField.ticketConfig.promoCodes.find(p => p.code.toLowerCase() === previewPromoCode.toLowerCase());
        if (found) {
            setPreviewAppliedPromo(found);
            setPreviewPromoCode('');
            showNotification('Promo code applied!', 'success');
        } else {
            showNotification('Invalid promo code', 'error');
        }
    };

    const finalizePreview = () => {
        setPreviewLoading(true);

        setTimeout(async () => {
            const submissionId = crypto.randomUUID();
            const invoiceId = `INV-${Math.random().toString(10).substr(2, 6)}`;
            const emailField = form.fields.find(f => f.type === 'email');
            const nameField = form.fields.find(f => f.type === 'text');

            const ticketSummary = Object.entries(previewTicketQuantities)
                .filter(([_, qty]: [string, number]) => qty > 0)
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
                qrPayload: JSON.stringify({ id: submissionId, invoiceId, formId: form.id, action: 'checkin' }),
                isTest: true,
                isPrimary: true,
                invoiceId,
                answers: previewAnswers
            };

            // Add donation info
            const ticketField = form.fields.find(f => f.type === 'ticket');
            if (ticketField?.ticketConfig?.enableDonations && (previewDonatedSeats > 0 || previewDonatedTables > 0)) {
                newAttendee.donationType = previewDonateOption === 'no' ? 'none' : previewDonateOption;
                newAttendee.donatedTables = previewDonatedTables;
                newAttendee.donatedSeats = previewDonatedSeats;
            }

            // Add dietary preferences from first guest
            if (ticketField?.ticketConfig?.enableGuestDetails && previewGuests.length > 0 && previewGuests[0].dietary) {
                newAttendee.dietaryPreferences = previewGuests[0].dietary === 'yes' ? 'Vegetarian' : '';
            }

            await saveAttendee(newAttendee);
            setLastGeneratedAttendee(newAttendee);
            setPreviewLoading(false);
            setPreviewStep('success');
            showNotification('Test registration created successfully!', 'success');
        }, 1500);
    };

    const resetPreview = () => {
        setPreviewStep('form');
        setPreviewAnswers({});
        setPreviewTicketQuantities({});
        setPreviewPaymentTotal(0);
        setPreviewError('');
        setLastGeneratedAttendee(null);
        setPreviewDonateOption('no');
        setPreviewDonatedSeats(0);
        setPreviewDonatedTables(0);
        setPreviewGuests([]);
        setPreviewSkipGuestDetails(false);
        setPreviewPromoCode('');
        setPreviewAppliedPromo(null);
    };

    const ticketField = form.fields.find(f => f.type === 'ticket');

    return (
        <div className="flex-1 min-h-0 bg-gray-100 overflow-y-auto pt-2 lg:pt-4 px-4 lg:px-6 flex justify-center pb-20 custom-scrollbar">
            <div className="w-full max-w-2xl flex flex-col h-fit">

                {/* Simulated Public Registration Page */}
                <div
                    className="w-full rounded-2xl shadow-2xl flex flex-col relative"
                    style={{
                        backgroundColor: form.settings?.formBackgroundColor || '#F3F4F6',
                        backgroundImage: form.settings?.formBackgroundImage ? `url(${form.settings.formBackgroundImage})` : 'none',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                    }}
                >
                    {/* Overlay for background image readability */}
                    {form.settings?.formBackgroundImage && (
                        <div className="absolute inset-0 bg-black/10 pointer-events-none"></div>
                    )}

                    {previewStep === 'form' && (
                        <div className="relative z-10 flex flex-col items-center py-8 px-4">
                            <div className="max-w-xl w-full bg-white/95 backdrop-blur-sm rounded-2xl shadow-xl overflow-hidden border border-white/20">
                                {/* Header — matches PublicRegistration */}
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

                                {/* Form Body */}
                                <form onSubmit={handlePreviewSubmit} className="p-8 space-y-6">
                                    {previewError && (
                                        <div className="bg-red-50 text-red-600 p-3 rounded-lg flex items-center gap-2 text-sm">
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

                                            {/* Textarea */}
                                            {field.type === 'textarea' ? (
                                                <textarea
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    rows={3}
                                                    placeholder={field.placeholder}
                                                    value={previewAnswers[field.id] || ''}
                                                    onChange={e => setPreviewAnswers({ ...previewAnswers, [field.id]: e.target.value })}
                                                />

                                                /* Select/Dropdown */
                                            ) : field.type === 'select' ? (
                                                <select
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                    value={previewAnswers[field.id] || ''}
                                                    onChange={e => setPreviewAnswers({ ...previewAnswers, [field.id]: e.target.value })}
                                                >
                                                    <option value="">Select an option</option>
                                                    {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                </select>

                                                /* Ticket Block — matches PublicRegistration exactly */
                                            ) : field.type === 'ticket' ? (
                                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                                                    <div className="mb-4 pb-2 border-b border-gray-200">
                                                        <span className="font-bold text-gray-900 block text-lg">{field.label}</span>
                                                        <span className="text-xs text-gray-500">Select your tickets below</span>
                                                    </div>

                                                    {/* Ticket Items */}
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
                                                                        value={previewTicketQuantities[item.id] || 0}
                                                                        onChange={e => setPreviewTicketQuantities({ ...previewTicketQuantities, [item.id]: parseInt(e.target.value) })}
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
                                                            value={previewPromoCode}
                                                            onChange={e => setPreviewPromoCode(e.target.value)}
                                                        />
                                                        <button
                                                            type="button" onClick={applyPreviewPromo}
                                                            className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300"
                                                        >
                                                            Apply
                                                        </button>
                                                    </div>
                                                    {previewAppliedPromo && (
                                                        <div className="text-xs text-green-600 flex items-center gap-1 mb-2">
                                                            <Tag className="w-3 h-3" /> Code applied: {previewAppliedPromo.code}
                                                        </div>
                                                    )}

                                                    {/* Donation Section — matches PublicRegistration */}
                                                    {field.ticketConfig?.enableDonations && field.ticketConfig.items.some(item => (previewTicketQuantities[item.id] > 0) && (item.seats || 1) > 1) && (
                                                        <div className="mb-4 pt-4 border-t border-gray-200 animate-in slide-in-from-top-2">
                                                            <div className="font-bold text-gray-800 mb-1">{field.ticketConfig?.donationSectionTitle || 'Donate a Table or Seats'}</div>
                                                            <p className="text-xs text-gray-500 mb-3">{field.ticketConfig?.donationSectionDescription || 'Are you donating this table or any seats?'}</p>
                                                            <div className="flex flex-wrap gap-3 mb-3">
                                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                                    <input type="radio" value="no" name="previewDonateOption" checked={previewDonateOption === 'no'} onChange={() => { setPreviewDonateOption('no'); setPreviewDonatedSeats(0); setPreviewDonatedTables(0); }} className="w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
                                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-indigo-600">No thanks</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                                    <input type="radio" value="table" name="previewDonateOption" checked={previewDonateOption === 'table'} onChange={() => {
                                                                        setPreviewDonateOption('table');
                                                                        const tableItem = field.ticketConfig!.items.find(item => (previewTicketQuantities[item.id] > 0) && (item.seats || 1) > 1);
                                                                        const seatsPerTable = tableItem?.seats || 8;
                                                                        setPreviewDonatedTables(1);
                                                                        setPreviewDonatedSeats(seatsPerTable);
                                                                    }} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-600">Table</span>
                                                                </label>
                                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                                    <input type="radio" value="seats" name="previewDonateOption" checked={previewDonateOption === 'seats'} onChange={() => { setPreviewDonateOption('seats'); setPreviewDonatedTables(0); setPreviewDonatedSeats(0); }} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                                                                    <span className="text-sm font-medium text-gray-700 group-hover:text-emerald-600">Seats</span>
                                                                </label>
                                                            </div>

                                                            {previewDonateOption === 'table' && (() => {
                                                                const tableItems = field.ticketConfig!.items.filter(item => (previewTicketQuantities[item.id] > 0) && (item.seats || 1) > 1);
                                                                const totalTablesPurchased = tableItems.reduce((acc, item) => acc + (previewTicketQuantities[item.id] || 0), 0);
                                                                const seatsPerTable = tableItems[0]?.seats || 8;

                                                                return (
                                                                    <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200 animate-in zoom-in-95 duration-200">
                                                                        {totalTablesPurchased > 1 ? (
                                                                            <>
                                                                                <label className="block text-xs font-bold text-emerald-700 uppercase mb-1.5 flex items-center gap-2">
                                                                                    How many tables would you like to donate? <Check className="w-3 h-3" />
                                                                                </label>
                                                                                <select
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                                                                                    value={previewDonatedTables}
                                                                                    onChange={e => {
                                                                                        const tables = Math.max(0, parseInt(e.target.value) || 0);
                                                                                        setPreviewDonatedTables(tables);
                                                                                        setPreviewDonatedSeats(tables * seatsPerTable);
                                                                                    }}
                                                                                >
                                                                                    {[...Array(totalTablesPurchased + 1)].map((_, i) => (
                                                                                        <option key={i} value={i}>{i} table{i !== 1 ? 's' : ''} ({i * seatsPerTable} seats)</option>
                                                                                    ))}
                                                                                </select>
                                                                            </>
                                                                        ) : (
                                                                            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
                                                                                <Check className="w-4 h-4" />
                                                                                Donating 1 table ({seatsPerTable} seats)
                                                                            </div>
                                                                        )}
                                                                        <p className="text-[11px] text-emerald-600 mt-2">{field.ticketConfig?.donationHelpText || 'These seats will be made available for individuals who may not otherwise be able to attend.'}</p>
                                                                    </div>
                                                                );
                                                            })()}

                                                            {previewDonateOption === 'seats' && (
                                                                <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 animate-in zoom-in-95 duration-200">
                                                                    <label className="block text-xs font-bold text-emerald-700 uppercase mb-1.5 flex items-center gap-2">{field.ticketConfig?.donationQuestionLabel || 'How many seats would you like to donate?'} <Check className="w-3 h-3" /></label>
                                                                    <select
                                                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-500"
                                                                        value={previewDonatedSeats}
                                                                        onChange={e => setPreviewDonatedSeats(Math.max(0, parseInt(e.target.value) || 0))}
                                                                    >
                                                                        {[...Array(11)].map((_, i) => <option key={i} value={i}>{i} seat{i !== 1 ? 's' : ''}</option>)}
                                                                    </select>
                                                                    <p className="text-[11px] text-emerald-600 mt-2">{field.ticketConfig?.donationHelpText || 'These seats will be made available for individuals who may not otherwise be able to attend.'}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* Guest Details — matches PublicRegistration */}
                                                    {field.ticketConfig?.enableGuestDetails && previewGuests.length > 0 && (
                                                        <div className="mb-4 pt-4 border-t border-gray-200">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div className="font-bold text-gray-800">Guest Details</div>
                                                                {previewGuests.length > 1 && (
                                                                    <label className="flex items-center gap-2 cursor-pointer group">
                                                                        <input type="checkbox" checked={previewSkipGuestDetails} onChange={e => setPreviewSkipGuestDetails(e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 transition" />
                                                                        <span className="text-[10px] font-bold text-gray-400 group-hover:text-indigo-600 uppercase tracking-widest transition-colors">Skip for now</span>
                                                                    </label>
                                                                )}
                                                            </div>

                                                            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                                                                Please provide details for each ticket holder.
                                                            </p>

                                                            {previewSkipGuestDetails ? (
                                                                <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 animate-in zoom-in-95 duration-300">
                                                                    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                                                                    <p className="text-xs text-amber-800 leading-relaxed italic">
                                                                        No problem! You can skip providing your guest names right now. After purchase, you can use the unique guest registration link found on your ticket to invite them.
                                                                    </p>
                                                                </div>
                                                            ) : (
                                                                <div className="space-y-3">
                                                                    {previewGuests.map((g, i) => (
                                                                        <div key={i} className="bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
                                                                            <div className="text-[10px] font-black text-gray-400 uppercase mb-3 flex justify-between items-center">
                                                                                <span>Ticket #{i + 1}</span>
                                                                                {i === 0 && <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-bold">Purchaser</span>}
                                                                            </div>

                                                                            {i === 0 && previewIsFirstGuestPurchaser ? (
                                                                                <div className="mb-2">
                                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                                                                                        <div className="bg-gray-100 text-gray-500 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-not-allowed select-none italic">
                                                                                            {g.name || (form.fields.find(f => f.label.toLowerCase().includes('name')) ? '(Name from above)' : 'Purchaser Name')}
                                                                                        </div>
                                                                                        <div className="bg-gray-100 text-gray-500 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-not-allowed select-none italic">
                                                                                            {g.email || (form.fields.find(f => f.label.toLowerCase().includes('email')) ? '(Email from above)' : 'Purchaser Email')}
                                                                                        </div>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => setPreviewIsFirstGuestPurchaser(false)}
                                                                                        className="text-xs text-indigo-600 font-bold hover:underline flex items-center gap-1"
                                                                                    >
                                                                                        Change to guest
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                                <>
                                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                                                                                        <input
                                                                                            type="text" placeholder="Guest Name"
                                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                                                            value={g.name}
                                                                                            onChange={e => {
                                                                                                const newGuests = [...previewGuests];
                                                                                                newGuests[i].name = e.target.value;
                                                                                                setPreviewGuests(newGuests);
                                                                                            }}
                                                                                        />
                                                                                        <input
                                                                                            type="email" placeholder="Guest Email"
                                                                                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                                                                                            value={g.email}
                                                                                            onChange={e => {
                                                                                                const newGuests = [...previewGuests];
                                                                                                newGuests[i].email = e.target.value;
                                                                                                setPreviewGuests(newGuests);
                                                                                            }}
                                                                                        />
                                                                                    </div>

                                                                                    <div className="flex items-center justify-between mt-1">
                                                                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Vegetarian?</span>
                                                                                        <div className="flex gap-4">
                                                                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                                                                <input type="radio" name={`preview-veg-${i}`} checked={g.dietary === 'no'} onChange={() => {
                                                                                                    const newGuests = [...previewGuests];
                                                                                                    newGuests[i].dietary = 'no';
                                                                                                    setPreviewGuests(newGuests);
                                                                                                }} className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500" />
                                                                                                <span className="text-xs text-gray-600">No</span>
                                                                                            </label>
                                                                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                                                                <input type="radio" name={`preview-veg-${i}`} checked={g.dietary === 'yes'} onChange={() => {
                                                                                                    const newGuests = [...previewGuests];
                                                                                                    newGuests[i].dietary = 'yes';
                                                                                                    setPreviewGuests(newGuests);
                                                                                                }} className="w-3.5 h-3.5 text-indigo-600 focus:ring-indigo-500" />
                                                                                                <span className="text-xs text-gray-600">Yes</span>
                                                                                            </label>
                                                                                        </div>
                                                                                    </div>

                                                                                    {i === 0 && !previewIsFirstGuestPurchaser && (
                                                                                        <button type="button" onClick={() => setPreviewIsFirstGuestPurchaser(true)} className="text-xs text-gray-400 font-medium mt-2 hover:text-gray-600">
                                                                                            Cancel (Use Purchaser Details)
                                                                                        </button>
                                                                                    )}
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {/* Totals */}
                                                                    <div className="pt-4 border-t border-gray-200 flex justify-between items-center">
                                                                        <span className="text-sm font-bold text-gray-700">Total:</span>
                                                                        <span className="text-xl font-bold text-indigo-700">
                                                                            {previewPaymentTotal.toFixed(2)} {field.ticketConfig?.currency}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                /* Radio */
                                                            ) : field.type === 'radio' ? (
                                                            <div className="space-y-2 mt-2">
                                                                {field.options?.map(opt => (
                                                                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                                                        <input type="radio" name={`preview-${field.id}`} value={opt}
                                                                            checked={previewAnswers[field.id] === opt}
                                                                            onChange={e => setPreviewAnswers({ ...previewAnswers, [field.id]: e.target.value })}
                                                                            className="text-indigo-600 focus:ring-indigo-500"
                                                                        />
                                                                        <span className="text-sm text-gray-700">{opt}</span>
                                                                    </label>
                                                                ))}
                                                            </div>

                                                /* Checkbox */
                                                            ) : field.type === 'checkbox' ? (
                                                            <div className="space-y-2 mt-2">
                                                                {field.options?.map(opt => (
                                                                    <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                                                        <input type="checkbox" value={opt}
                                                                            checked={(previewAnswers[field.id] || []).includes(opt)}
                                                                            onChange={e => {
                                                                                const current = previewAnswers[field.id] || [];
                                                                                const next = e.target.checked
                                                                                    ? [...current, opt]
                                                                                    : current.filter((v: string) => v !== opt);
                                                                                setPreviewAnswers({ ...previewAnswers, [field.id]: next });
                                                                            }}
                                                                            className="text-indigo-600 focus:ring-indigo-500"
                                                                        />
                                                                        <span className="text-sm text-gray-700">{opt}</span>
                                                                    </label>
                                                                ))}
                                                            </div>

                                                /* Boolean Toggle */
                                                            ) : field.type === 'boolean' ? (
                                                            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-100 hover:bg-gray-50 transition cursor-pointer"
                                                                onClick={() => setPreviewAnswers({ ...previewAnswers, [field.id]: !previewAnswers[field.id] })}
                                                            >
                                                                <span className="text-sm font-medium text-gray-700">{field.label}</span>
                                                                <div className={`w-12 h-6 rounded-full relative transition-colors duration-200 ${previewAnswers[field.id] ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                                                                    <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${previewAnswers[field.id] ? 'translate-x-6' : ''}`}></div>
                                                                </div>
                                                            </div>

                                                /* Default: text, email, phone, number, address */
                                                            ) : (
                                                            <div className="relative">
                                                                {field.type === 'address' && <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />}
                                                                <input
                                                                    type={field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'}
                                                                    inputMode={field.type === 'text' && field.validation === 'int' ? 'numeric' : undefined}
                                                                    className={`w-full ${field.type === 'address' ? 'pl-10' : 'px-3'} py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition`}
                                                                    placeholder={field.placeholder}
                                                                    value={previewAnswers[field.id] || ''}
                                                                    onChange={e => setPreviewAnswers({ ...previewAnswers, [field.id]: e.target.value })}
                                                                />
                                                            </div>
                                            )}
                                                        </div>
                                                    ))}

                                                    {/* Submit Button — matches PublicRegistration */}
                                                    <div className="pt-4">
                                                        <button
                                                            type="submit"
                                                            className="w-full py-4 text-white rounded-xl font-black uppercase tracking-widest transition shadow-lg flex justify-center items-center gap-2 transform hover:scale-[1.02] active:scale-95"
                                                            style={{ backgroundColor: form.settings?.formAccentColor || '#4F46E5' }}
                                                        >
                                                            {(ticketField && previewPaymentTotal > 0) ? (
                                                                <>Proceed to Payment <ArrowRight className="w-5 h-5" /></>
                                                            ) : (form.settings?.submitButtonText || 'Register Now')}
                                                        </button>
                                                    </div>
                                                </form>
                            </div>
                        </div>
                    )}

                            {previewStep === 'payment' && (
                                <div className="relative z-10 flex justify-center py-8 px-4">
                                    <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                                        <h2 className="text-2xl font-bold text-gray-900 mb-2">Secure Payment</h2>
                                        <p className="text-gray-500 mb-8">Complete your purchase to receive your ticket.</p>

                                        <div className="bg-gray-50 p-4 rounded-xl mb-8 border border-gray-100">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="text-gray-600">Ticket(s) Subtotal</span>
                                                <span className="font-medium text-gray-900">{previewPaymentTotal.toFixed(2)} {ticketField?.ticketConfig?.currency}</span>
                                            </div>
                                            {previewAppliedPromo && (
                                                <div className="flex justify-between items-center text-sm text-green-600 border-t border-gray-200 pt-2 mt-2">
                                                    <span>Promo ({previewAppliedPromo.code})</span>
                                                    <span>Applied</span>
                                                </div>
                                            )}
                                            {(previewDonatedSeats > 0 || previewDonatedTables > 0) && (
                                                <div className="flex justify-between items-center text-sm text-emerald-600 border-t border-gray-200 pt-2 mt-2">
                                                    <span>{previewDonateOption === 'table' ? 'Donated Tables' : 'Donated Seats'}</span>
                                                    <span>{previewDonateOption === 'table' ? `${previewDonatedTables} table${previewDonatedTables !== 1 ? 's' : ''} (${previewDonatedSeats} seats)` : `${previewDonatedSeats} seat${previewDonatedSeats !== 1 ? 's' : ''}`}</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center text-lg font-bold text-indigo-600 border-t border-gray-200 pt-3 mt-3">
                                                <span>Total Due</span>
                                                <span>{previewPaymentTotal.toFixed(2)} {ticketField?.ticketConfig?.currency}</span>
                                            </div>
                                        </div>

                                        <button onClick={finalizePreview} disabled={previewLoading} className="w-full py-3 bg-yellow-400 text-blue-900 font-bold rounded-lg flex justify-center items-center gap-2">
                                            {previewLoading ? <Loader2 className="animate-spin" /> : 'Simulate PayPal Payment'}
                                        </button>
                                        <button onClick={() => setPreviewStep('form')} className="mt-4 text-sm text-gray-500 underline">Back</button>
                                    </div>
                                </div>
                            )}

                            {previewStep === 'success' && (
                                <div className="relative z-10 flex justify-center py-8 px-4">
                                    <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden animate-fade-in">
                                        {/* Success Banner — matches PublicRegistration */}
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
                                            {/* Thank You Message */}
                                            {form.thankYouMessage ? (
                                                <div
                                                    className="prose prose-sm max-w-none text-gray-600 mb-6"
                                                    dangerouslySetInnerHTML={{ __html: form.thankYouMessage }}
                                                />
                                            ) : (
                                                <>
                                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">You're going!</h2>
                                                    <p className="text-gray-500 mb-6">A confirmation email with your ticket has been sent to <span className="font-semibold">{lastGeneratedAttendee?.email || 'test@example.com'}</span>.</p>
                                                </>
                                            )}

                                            {/* QR Code Card */}
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
                                                        <QRCode value={lastGeneratedAttendee?.qrPayload || JSON.stringify({ id: 'TEST-8X29B', isTest: true })} size={160} />
                                                    </div>

                                                    <div className="text-sm font-mono bg-white p-3 rounded-xl border border-gray-200 text-gray-700 mb-6 flex justify-between items-center">
                                                        <span className="text-gray-400 text-[10px] uppercase font-bold">Ticket ID</span>
                                                        <span className="font-bold">#{lastGeneratedAttendee?.id || 'TEST-8X29B'}</span>
                                                    </div>

                                                    {(form.settings?.showTicketButtonOnSuccess !== false) && (
                                                        <button
                                                            className="w-full py-4 text-white rounded-xl text-sm font-black uppercase tracking-widest shadow-lg transition transform hover:scale-[1.02]"
                                                            style={{ backgroundColor: form.settings?.successHeaderColor || '#4F46E5' }}
                                                        >
                                                            <Download className="w-5 h-5 inline mr-2" /> Download PDF Ticket
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Fallback button if QR card is hidden but button is shown */}
                                            {(form.settings?.showQrOnSuccess === false && form.settings?.showTicketButtonOnSuccess !== false) && (
                                                <button
                                                    className="w-full max-w-sm mx-auto py-4 rounded-xl text-base font-bold flex items-center justify-center gap-2 border shadow-sm transition mb-8"
                                                    style={{
                                                        backgroundColor: (form.settings?.successHeaderColor || '#4F46E5') + '10',
                                                        color: form.settings?.successIconColor || '#10B981',
                                                        borderColor: (form.settings?.successHeaderColor || '#4F46E5') + '30'
                                                    }}
                                                >
                                                    <Download className="w-5 h-5" /> Download PDF Ticket
                                                </button>
                                            )}

                                            <button onClick={resetPreview} className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:shadow-xl hover:-translate-y-0.5 transition active:scale-95 mb-8">
                                                Test Another Response
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                {/* Preview Mode Badge */}
                    <div className="text-center mt-4">
                        <span className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full text-[10px] font-bold text-gray-400 border border-gray-200 uppercase tracking-widest shadow-sm">
                            <Eye className="w-3 h-3" /> Live Preview — Matches Registration Page
                        </span>
                    </div>
                </div>
            </div>
            );
};

            export default FormPreview;
