import React, { useState, useEffect } from 'react';
import { getFormById, getSettings, saveAttendee } from '../services/storageService';
import { FormField, AppSettings, Attendee, Form } from '../types';
import { Loader2, Check, AlertCircle, Download, Calendar, Tag, CreditCard, ArrowRight, X, Eye } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { generateTicketPDF } from '../utils/pdfGenerator';

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
  
  // Ticket / Payment State
  // Map itemId -> quantity
  const [ticketQuantities, setTicketQuantities] = useState<Record<string, number>>({});
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{code: string, value: number, type: 'percent'|'fixed'} | null>(null);
  const [paymentTotal, setPaymentTotal] = useState(0);

  useEffect(() => {
    if (formId) {
      setForm(getFormById(formId) || null);
    }
    setSettings(getSettings());
  }, [formId]);

  const ticketField = form?.fields.find(f => f.type === 'ticket');

  useEffect(() => {
    if (ticketField && ticketField.ticketConfig) {
      let subtotal = 0;
      ticketField.ticketConfig.items.forEach(item => {
        const qty = ticketQuantities[item.id] || 0;
        subtotal += item.price * qty;
      });

      let discount = 0;
      if (appliedPromo) {
        if (appliedPromo.type === 'percent') {
          discount = subtotal * (appliedPromo.value / 100);
        } else {
          discount = appliedPromo.value;
        }
      }
      setPaymentTotal(Math.max(0, subtotal - discount));
    }
  }, [ticketField, ticketQuantities, appliedPromo]);

  const isVisible = (field: FormField) => {
    if (!field.conditional?.enabled) return true;
    const targetValue = answers[field.conditional.fieldId];
    return targetValue === field.conditional.value;
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
    } else {
      alert("Invalid promo code");
    }
  };

  const validate = () => {
    if (!form) return false;
    for (const field of form.fields) {
      if (isVisible(field) && field.required && !answers[field.id] && field.type !== 'ticket') {
        setError(`Please fill in ${field.label}`);
        return false;
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

  const finalizeRegistration = async (paymentStatus: 'paid' | 'free') => {
    if (!form) return;
    setLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      const submissionId = Math.random().toString(36).substr(2, 9).toUpperCase();
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

      const newAttendee: Attendee = {
        id: submissionId,
        formId: form.id,
        formTitle: form.title,
        name: nameField ? answers[nameField.id] : 'Guest',
        email: emailField ? answers[emailField.id] : 'unknown@example.com',
        ticketType: ticketTypeSummary,
        registeredAt: new Date().toISOString(),
        answers: answers,
        paymentStatus,
        invoiceId,
        qrPayload: JSON.stringify({ id: submissionId, invoiceId, formId: form.id, action: 'checkin' })
      };

      saveAttendee(newAttendee);
      setGeneratedTicket(newAttendee);
      setLoading(false);
      setStep('success');

      // Generate Preview URL for Modal
      if (settings) {
        const doc = generateTicketPDF(newAttendee, settings);
        setPreviewPdfUrl(doc.output('bloburl').toString());
      }

    }, 2000);
  };

  // Mock PayPal Payment
  const handlePayPalPayment = () => {
    setLoading(true);
    // Simulate PayPal pop-up interaction
    setTimeout(() => {
      setLoading(false);
      finalizeRegistration('paid');
    }, 1500);
  };

  const downloadPdf = () => {
    if (generatedTicket && settings) {
      const doc = generateTicketPDF(generatedTicket, settings);
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
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8 flex flex-col items-center">
      {step === 'form' && (
        <div className="max-w-xl w-full bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-indigo-600 px-8 py-6">
            <h1 className="text-2xl font-bold text-white">{form.title}</h1>
            <p className="text-indigo-100 mt-2">{form.description}</p>
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
                             else handleInputChange(field.id, current.filter((v:string) => v !== opt));
                          }}
                          className="text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : field.type === 'boolean' ? (
                  <div className="flex items-center gap-4 mt-2">
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name={field.id}
                          checked={answers[field.id] === 'Yes'}
                          onChange={() => handleInputChange(field.id, 'Yes')}
                        />
                        <span className="text-sm text-gray-700">Yes</span>
                     </label>
                     <label className="flex items-center gap-2 cursor-pointer">
                        <input 
                          type="radio" 
                          name={field.id}
                          checked={answers[field.id] === 'No'}
                          onChange={() => handleInputChange(field.id, 'No')}
                        />
                        <span className="text-sm text-gray-700">No</span>
                     </label>
                  </div>
                ) : (
                  <input 
                    type={field.type}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder={field.placeholder}
                    value={answers[field.id] || ''}
                    onChange={e => handleInputChange(field.id, e.target.value)}
                  />
                )}
              </div>
            ))}

            <div className="pt-4">
              <button 
                type="submit"
                className="w-full py-3 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition shadow-md flex justify-center items-center gap-2"
              >
                {(ticketField && paymentTotal > 0) ? (
                   <>Proceed to Payment <ArrowRight className="w-5 h-5"/></>
                ) : 'Register Now'}
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
               <span className="font-medium text-gray-900">{paymentTotal.toFixed(2)} {ticketField?.ticketConfig?.currency}</span>
             </div>
             {appliedPromo && (
               <div className="flex justify-between items-center text-sm text-green-600 border-t border-gray-200 pt-2 mt-2">
                 <span>Promo ({appliedPromo.code})</span>
                 <span>Applied</span>
               </div>
             )}
             <div className="flex justify-between items-center text-lg font-bold text-indigo-600 border-t border-gray-200 pt-3 mt-3">
               <span>Total Due</span>
               <span>{paymentTotal.toFixed(2)} {ticketField?.ticketConfig?.currency}</span>
             </div>
          </div>

          <button 
            onClick={handlePayPalPayment}
            disabled={loading}
            className="w-full py-4 bg-[#FFC439] hover:bg-[#F4BB30] text-blue-900 font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" /> : 
              <img src="https://www.paypalobjects.com/webstatic/en_US/i/buttons/PP_logo_h_100x26.png" alt="PayPal" className="h-6" />
            }
          </button>
          
          <button 
            onClick={() => {
                alert("Stripe Integration Placeholder");
                handlePayPalPayment(); // Just simulate success for now
            }}
            className="w-full mt-3 py-4 bg-gray-900 text-white font-bold rounded-lg transition shadow-sm flex items-center justify-center gap-2 hover:bg-gray-800"
          >
             <CreditCard className="w-5 h-5" /> Pay with Card
          </button>

          <p className="text-xs text-gray-400 mt-4">Safe and secure payments.</p>
        </div>
      )}

      {step === 'success' && generatedTicket && (
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center animate-fade-in-up">
           <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
             <Check className="w-8 h-8 text-green-600" />
           </div>
           
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

           <div className="border border-gray-200 rounded-xl p-6 bg-gray-50 mb-6 text-left">
             <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
               <Calendar className="w-4 h-4 text-indigo-600" /> {generatedTicket.formTitle}
             </h3>
             <p className="text-sm text-gray-600 mb-4">Attendee: {generatedTicket.name}</p>
             
             <div className="flex gap-2">
                <button 
                  onClick={() => setShowPreviewModal(true)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 transition"
                >
                  <Eye className="w-4 h-4" /> Preview
                </button>
                <button 
                  onClick={downloadPdf}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 transition"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
             </div>
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