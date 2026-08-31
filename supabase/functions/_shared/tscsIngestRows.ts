// Pure row-builder for the TSCS India ingest pipeline.
//
// Turns one parsed TSCS registration into the attendees rows to insert.
// Extracted from the edge function so the row semantics — dedupe keys,
// payment columns, the NULL-payment_method rule for free companions —
// are unit-testable under vitest without any Deno/IMAP machinery.

import { categoryToPricingId, type TscsRegistration } from './tscsEmailParse.ts';

/** Category id → display name used as ticket_type (mirrors the pricing template). */
export const TSCS_CATEGORY_NAMES: Record<string, string> = {
  physician: 'Physicians/Researchers',
  trainee: 'Medical Trainees (Residents, Fellows)',
  abstract_presenter: 'Abstract Presenters',
  student: 'Undergraduate, Medical, Graduate Students',
  nurse: 'Nurses or Allied Health Professionals',
  industry: 'Industry Partners',
  patient_org: 'Patient Organizations',
  patient: 'Patients or Family Members',
};

export interface BuildRowsOpts {
  source: string;
  messageId?: string;
  isTest?: boolean;
  formId: string;
  pricingTemplateId: string;
  /** Injectable for deterministic tests; defaults to crypto.randomUUID. */
  uuid?: () => string;
  now?: () => string;
}

export type BuildRowsResult =
  | { ok: true; rows: Record<string, unknown>[]; primaryId: string; txnBase: string }
  | { ok: false; error: string };

export function buildTscsAttendeeRows(reg: TscsRegistration, opts: BuildRowsOpts): BuildRowsResult {
  const catId = categoryToPricingId(reg.category);
  if (!catId) return { ok: false, error: `unrecognized category: ${reg.category}` };
  const ticketType = TSCS_CATEGORY_NAMES[catId];

  // Dedupe key: the Razorpay payment id when present, else a deterministic id
  // from the email message id — so IMAP re-reads of the same message can
  // never double-register anyone.
  const txnBase = reg.payment_id || (opts.messageId ? `tscs-${opts.messageId}` : null);
  if (!txnBase) return { ok: false, error: 'no payment id and no message id to dedupe on' };

  const uuid = opts.uuid ?? (() => crypto.randomUUID());
  const nowIso = (opts.now ?? (() => new Date().toISOString()))();
  const evidence = `TSCS India ingest (${opts.source})${opts.messageId ? `, message ${opts.messageId}` : ''}${reg.payment_id ? `, Razorpay payment ${reg.payment_id}` : ''}. Collected in INR by TSCS via their Razorpay account.`;

  const primaryId = uuid();
  const rows: Record<string, unknown>[] = [];

  const splitName = (n: string) => {
    const parts = n.trim().split(/\s+/);
    return { first: parts[0] || '', last: parts.slice(1).join(' ') };
  };
  // Attending days arrive comma-joined, but the values themselves contain
  // commas ("October 23, 2026") — so after splitting, re-attach any fragment
  // that is just a bare year to the date before it.
  const days = (csv?: string) => {
    if (!csv) return null;
    const out: string[] = [];
    for (const part of csv.split(',').map((d) => d.trim()).filter(Boolean)) {
      if (/^\d{4}$/.test(part) && out.length > 0) out[out.length - 1] += `, ${part}`;
      else out.push(part);
    }
    return out;
  };

  // Primary carries the collected TOTAL; group members carry their own fee
  // when the payload provides one, else a deliberately NON-monetary marker so
  // reports never double-count the total and pay-balance can never re-collect
  // (parsePaymentAmount refuses non-monetary strings).
  const totalLabel = reg.total_inr != null ? `${Number(reg.total_inr).toFixed(2)} INR` : 'PAID VIA TSCS (INR)';

  rows.push({
    id: primaryId,
    form_id: opts.formId,
    name: reg.name,
    email: reg.email,
    ticket_type: ticketType,
    qr_payload: JSON.stringify({ id: primaryId }),
    payment_status: 'paid',
    payment_method: 'razorpay',
    payment_amount: totalLabel,
    transaction_id: txnBase,
    pricing_template_id: opts.pricingTemplateId,
    pricing_category_id: catId,
    is_test: !!opts.isTest,
    is_primary: true,
    registered_at: nowIso,
    answers: {
      f_fname: reg.first_name || splitName(reg.name).first,
      f_lname: reg.last_name || splitName(reg.name).last,
      f_email: reg.email,
      f_phone: reg.phone || null,
      f_city: reg.city || null,
      f_org: reg.institution || null,
      f_role: reg.role || null,
      f_country: 'IN',
      f_days: days(reg.attending_days),
      tscs_source: opts.source,
      tscs_message_id: opts.messageId || null,
      tscs_payment_id: reg.payment_id || null,
    },
    admin_notes: evidence,
  });

  for (let i = 0; i < (reg.group?.length || 0); i++) {
    const g = reg.group![i];
    const gCat = categoryToPricingId(g.category || reg.category) || catId;
    const gid = uuid();
    const { first, last } = splitName(g.name);
    rows.push({
      id: gid,
      form_id: opts.formId,
      name: g.name,
      email: g.email || reg.email,
      ticket_type: TSCS_CATEGORY_NAMES[gCat],
      qr_payload: JSON.stringify({ id: gid }),
      payment_status: 'paid',
      payment_method: 'razorpay',
      payment_amount: g.fee != null ? `${Number(g.fee).toFixed(2)} INR` : `PAID WITH ${txnBase} (INR)`,
      transaction_id: `${txnBase}-p${i + 2}`,
      pricing_template_id: opts.pricingTemplateId,
      pricing_category_id: gCat,
      is_test: !!opts.isTest,
      is_primary: false,
      primary_attendee_id: primaryId,
      registered_at: nowIso,
      answers: {
        f_fname: first,
        f_lname: last,
        f_email: g.email || null,
        f_org: g.institution || null,
        f_role: g.role || null,
        f_days: days(g.attending_days),
        f_country: 'IN',
        tscs_source: opts.source,
      },
      admin_notes: evidence,
    });
  }

  // Free add-on person: payment_method stays NULL — the CHECK constraint
  // reserves non-null values for actual payment paths (see issuedTicket.ts).
  if (reg.addon && (reg.addon.name || '').trim()) {
    const aid = uuid();
    rows.push({
      id: aid,
      form_id: opts.formId,
      name: reg.addon.name!.trim(),
      email: (reg.addon.email || reg.email).trim().toLowerCase(),
      ticket_type: 'Registration (Free Add-on)',
      qr_payload: JSON.stringify({ id: aid }),
      payment_status: 'free',
      payment_method: null,
      payment_amount: '0',
      pricing_template_id: opts.pricingTemplateId,
      is_test: !!opts.isTest,
      is_primary: false,
      primary_attendee_id: primaryId,
      registered_at: nowIso,
      answers: { f_country: 'IN', tscs_source: opts.source },
      admin_notes: evidence,
    });
  }

  return { ok: true, rows, primaryId, txnBase };
}
