import React, { useState } from 'react';
import { Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { Form } from '../../types';
import RichTextEditor from '../RichTextEditor';

interface EmailOverridesSectionProps {
    form: Form;
    onUpdate: (updates: Partial<Form>) => void;
}

type CoreKey = 'ticket' | 'table-purchaser' | 'guest' | 'guest-claim' | 'guest-confirmed';

// Per-key metadata. Labels + placeholder lists mirror the global Email Templates
// tab (components/Settings/EmailTemplatesTab.tsx TEMPLATES array) so admins see
// the same placeholders they'd use globally.
const CORE_TEMPLATES: Array<{ key: CoreKey; label: string; placeholders: string[] }> = [
    { key: 'ticket', label: 'Ticket Confirmation (purchaser)', placeholders: ['name', 'event', 'id', 'invoiceId', 'amount'] },
    { key: 'table-purchaser', label: 'Table Purchaser', placeholders: ['name', 'event', 'id', 'invoiceId', 'amount'] },
    { key: 'guest', label: 'Guest Ticket', placeholders: ['name', 'purchaser', 'event'] },
    { key: 'guest-claim', label: 'Group — Needs Details', placeholders: ['name', 'purchaser', 'event', 'complete_url', 'signup_url'] },
    { key: 'guest-confirmed', label: 'Group — Details Filled', placeholders: ['name', 'purchaser', 'event', 'registration_id', 'qr_image_url', 'signup_url'] },
];

const EmailOverridesSection: React.FC<EmailOverridesSectionProps> = ({ form, onUpdate }) => {
    const [open, setOpen] = useState<boolean>(false);

    const overrides = form.settings?.emailOverrides;
    const enabled = overrides?.enabled === true;

    // Immutable writers — always spread through settings.emailOverrides so we
    // never mutate form.settings. Handle the all-undefined initial state.
    const patchOverrides = (patch: Partial<NonNullable<typeof overrides>>) => {
        onUpdate({
            settings: {
                ...form.settings,
                emailOverrides: { ...(form.settings?.emailOverrides ?? {}), ...patch },
            },
        });
    };

    const patchTemplate = (key: CoreKey, field: 'subject' | 'body', value: string) => {
        const prevTemplates = form.settings?.emailOverrides?.templates ?? {};
        const prevKey = prevTemplates[key] ?? {};
        patchOverrides({
            templates: { ...prevTemplates, [key]: { ...prevKey, [field]: value } },
        });
    };

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 animate-fade-in overflow-hidden">
            {/* Card header (chevron collapsible, matches sibling section idiom) */}
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left group"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                        <Mail className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Email Customization</h3>
                        <p className="text-sm text-gray-500 mt-0.5">
                            Override the registrant-facing emails for this specific form.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {enabled ? 'Custom' : 'Global'}
                    </span>
                    {open ? (
                        <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                    ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
                    )}
                </div>
            </button>

            {open && (
                <div className="px-6 pb-6 border-t border-gray-100 pt-6 space-y-6">
                    {/* Master toggle */}
                    <label className="flex items-center justify-between cursor-pointer group bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                        <div className="flex flex-col pr-4">
                            <span className="text-sm font-bold text-gray-800 group-hover:text-indigo-700 transition">
                                Use custom email templates for this form
                            </span>
                            <span className="text-xs text-gray-500 mt-0.5">
                                Off → this form uses the global Email Templates (Settings → Email Templates). On → customize the registrant-facing emails below; leave a field blank to inherit the global template.
                            </span>
                        </div>
                        <div
                            className={`w-12 h-6 rounded-full relative transition-colors duration-200 flex-shrink-0 ${enabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                            onClick={(e) => { e.preventDefault(); patchOverrides({ enabled: !enabled }); }}
                        >
                            <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 ${enabled ? 'translate-x-6' : ''}`}></div>
                        </div>
                    </label>

                    {!enabled ? (
                        <p className="text-sm text-gray-400 italic px-1">
                            This form uses the global Email Templates.
                        </p>
                    ) : (
                        <div className="space-y-8">
                            {/* Optional per-form header image */}
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Header image URL (optional)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition"
                                    placeholder="Leave blank to use the global banner"
                                    value={overrides?.headerImageUrl || ''}
                                    onChange={e => patchOverrides({ headerImageUrl: e.target.value })}
                                />
                                <p className="text-xs text-gray-500 mt-1 italic">Must be a public https:// image URL.</p>
                            </div>

                            {/* Per-template subject + body editors */}
                            {CORE_TEMPLATES.map(({ key, label, placeholders }) => {
                                const tpl = overrides?.templates?.[key];
                                const subjectValue = tpl?.subject ?? '';
                                const bodyValue = tpl?.body ?? '';
                                return (
                                    <div key={key} className="rounded-xl border border-gray-200 bg-gray-50/40 p-5 space-y-4">
                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-wide">{label}</h4>

                                        {/* Subject */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1.5">Subject Line</label>
                                            <input
                                                type="text"
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white"
                                                placeholder="Leave blank to inherit the global subject"
                                                value={subjectValue}
                                                onChange={e => patchTemplate(key, 'subject', e.target.value)}
                                            />
                                            {subjectValue.trim() === '' && (
                                                <p className="text-[11px] text-gray-400 mt-1 italic">Inheriting global</p>
                                            )}
                                        </div>

                                        {/* Body */}
                                        <div>
                                            <label className="block text-xs font-bold text-gray-700 mb-1.5">Body (HTML)</label>
                                            <RichTextEditor
                                                value={bodyValue}
                                                onChange={(val) => patchTemplate(key, 'body', val as string)}
                                                className="min-h-[220px]"
                                                placeholder="Leave blank to inherit the global template body"
                                            />
                                            {bodyValue.trim() === '' && (
                                                <p className="text-[11px] text-gray-400 mt-1 italic">Inheriting global</p>
                                            )}
                                        </div>

                                        {/* Available placeholders */}
                                        <div>
                                            <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                                Available placeholders
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {placeholders.map(ph => (
                                                    <code key={ph} className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-gray-200 text-gray-700">
                                                        {'{{'}{ph}{'}}'}
                                                    </code>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default EmailOverridesSection;
