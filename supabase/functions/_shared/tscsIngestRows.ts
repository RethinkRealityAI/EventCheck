// Pure row-builder for the TSCS India ingest pipeline.
//
// Turns one parsed TSCS registration into the attendees rows to insert.
// Extracted from the edge function so the row semantics — dedupe keys,
// payment columns, the NULL-payment_method rule for free companions, and the
// identified/pending split on companions — are unit-testable under vitest
// without any Deno/IMAP machinery.

import { categoryToPricingId, type TscsRegistration } from './tscsEmailParse.ts';
import {
  isPlaceholderEmail,
  pendingGuestName,
  placeholderEmailFor,
  resolveCompanionIdentity,
  type CompanionIdentity,
} from './companionIdentity.ts';

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

export const FREE_ADDON_TICKET_TYPE = 'Registration (Free Add-on)';

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

/** One companion the caller may need to act on after the insert. */
export interface CompanionSummary {
  attendeeId: string;
  /** 'identified' — a real person on the roster. 'pending' — a booked seat with nobody named yet. */
  status: 'identified' | 'pending';
  /** True only when the row carries the companion's OWN deliverable address. */
  hasOwnEmail: boolean;
  name: string;
  email: string;
}

export type BuildRowsResult =
  | { ok: true; rows: Record<string, unknown>[]; primaryId: string; txnBase: string; companions: CompanionSummary[] }
  | { ok: false; error: string };

export function buildTscsAttendeeRows(reg: TscsRegistration, opts: BuildRowsOpts): BuildRowsResult {
  const catId = categoryToPricingId(reg.category);
  if (!catId) return { ok: false, error: `unrecognized category: ${reg.category}` };
  const ticketType = TSCS_CATEGORY_NAMES[catId];

  // A Razorpay payment id is REQUIRED, and doubles as the dedupe key — so
  // IMAP re-reads of the same message can never double-register anyone. Test
  // rehearsals get their own key space: an is_test dry-run for pay_X must
  // never block (or be blocked by) the real ingest of pay_X later.
  //
  // This used to fall back to the email's message id when the mail carried no
  // transaction id, and that fallback is precisely how two "[PENDING]
  // Incomplete Registration" notices became paid attendee rows with tickets
  // attached. A TSCS mail can read as confirmed and still describe a checkout
  // nobody completed; the payment id is the only thing that cannot. Positive
  // proof of payment is now the sole way to build a paid row — everything
  // else is a human's call, made in the review queue.
  if (!reg.payment_id) {
    return { ok: false, error: 'no Razorpay payment id — refusing to create a paid registration' };
  }
  const txnBase = opts.isTest ? `test-${reg.payment_id}` : reg.payment_id;

  const uuid = opts.uuid ?? (() => crypto.randomUUID());
  const nowIso = (opts.now ?? (() => new Date().toISOString()))();
  const evidence = `TSCS India ingest (${opts.source})${opts.messageId ? `, message ${opts.messageId}` : ''}${reg.payment_id ? `, Razorpay payment ${reg.payment_id}` : ''}. Collected in INR by TSCS via their Razorpay account.`;

  const primaryId = uuid();
  const rows: Record<string, unknown>[] = [];
  const companions: CompanionSummary[] = [];

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

  /**
   * The bit every companion row shares: who they are, where their mail goes,
   * and what we keep so a human can repair a bad one.
   *
   * Only the NAME decides pending vs identified. A companion with a real name
   * and no address of their own is a real registrant whose mail routes through
   * the purchaser — hiding them from the roster would take them off the
   * check-in list for a seat that was paid for.
   */
  const companionShape = (id: string, identity: CompanionIdentity) => {
    const pending = identity.name === null;
    const name = pending ? pendingGuestName(reg.name) : identity.name!;
    // An unclaimed seat gets an address nothing can deliver to, so no bug can
    // ever mail a placeholder to the purchaser as if it were a person. A named
    // companion without their own address routes through the purchaser, which
    // is what leaving the field blank asks for.
    const email = pending ? placeholderEmailFor(id) : (identity.email ?? reg.email);
    const { first, last } = identity.name ? splitName(identity.name) : { first: '', last: '' };
    return {
      pending,
      name,
      email,
      guest_type: pending ? 'pending-claim' : null,
      answers: {
        f_fname: first || null,
        f_lname: last || null,
        // NULL is the durable signal for "this row's inbox is not theirs" —
        // the dashboard and every bulk send read it rather than guessing by
        // comparing addresses.
        f_email: identity.email,
        f_country: 'IN',
        tscs_source: opts.source,
        tscs_email_source: identity.email ? 'own' : 'inherited',
        tscs_companion_status: pending ? 'pending' : 'identified',
        // Verbatim, so whoever fixes a typo can see what the partner sent.
        tscs_raw_name: identity.rawName,
        tscs_raw_email: identity.rawEmail,
        tscs_name_issue: identity.nameReason === 'ok' ? null : identity.nameReason,
        tscs_email_issue: identity.emailReason === 'ok' ? null : identity.emailReason,
      } as Record<string, unknown>,
    };
  };

  const track = (id: string, shape: ReturnType<typeof companionShape>, ownEmail: boolean) => {
    companions.push({
      attendeeId: id,
      status: shape.pending ? 'pending' : 'identified',
      hasOwnEmail: ownEmail && !isPlaceholderEmail(shape.email),
      name: shape.name,
      email: shape.email,
    });
  };

  // Primary carries the collected TOTAL; group members carry their own fee
  // when the payload provides one, else a deliberately NON-monetary marker so
  // reports never double-count the total and pay-balance can never re-collect
  // (parsePaymentAmount refuses non-monetary strings).
  const totalNum = typeof reg.total_inr === 'number' && Number.isFinite(reg.total_inr) ? reg.total_inr : null;
  const totalLabel = totalNum != null ? `${totalNum.toFixed(2)} INR` : 'PAID VIA TSCS (INR)';

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

  const groupCount = reg.group?.length || 0;

  for (let i = 0; i < groupCount; i++) {
    const g = reg.group![i];
    const gCat = categoryToPricingId(g.category || reg.category) || catId;
    const gid = uuid();
    const identity = resolveCompanionIdentity({ name: g.name, email: g.email }, reg.email);
    const shape = companionShape(gid, identity);
    rows.push({
      id: gid,
      form_id: opts.formId,
      name: shape.name,
      email: shape.email,
      guest_type: shape.guest_type,
      ticket_type: TSCS_CATEGORY_NAMES[gCat],
      qr_payload: JSON.stringify({ id: gid }),
      payment_status: 'paid',
      payment_method: 'razorpay',
      payment_amount: typeof g.fee === 'number' && Number.isFinite(g.fee)
        ? `${g.fee.toFixed(2)} INR`
        : `PAID WITH ${txnBase} (INR)`,
      transaction_id: `${txnBase}-p${i + 2}`,
      pricing_template_id: opts.pricingTemplateId,
      pricing_category_id: gCat,
      is_test: !!opts.isTest,
      is_primary: false,
      primary_attendee_id: primaryId,
      registered_at: nowIso,
      answers: {
        ...shape.answers,
        f_org: g.institution || null,
        f_role: g.role || null,
        f_days: days(g.attending_days),
      },
      admin_notes: evidence,
    });
    track(gid, shape, !!identity.email);
  }

  // Free add-on person: payment_method stays NULL — the CHECK constraint
  // reserves non-null values for actual payment paths (see issuedTicket.ts) —
  // and so does pricing_category_id, because a complimentary seat was not sold
  // at any of the template's paid rates and must not be counted as one.
  //
  // The block runs whenever TSCS sent an add-on section at all, even an empty
  // one: the buyer paid for that seat either way, and a seat with nobody named
  // is `pending-claim`, not a seat we quietly drop.
  if (reg.addon && (reg.addon.name || reg.addon.email)) {
    const aid = uuid();
    const identity = resolveCompanionIdentity(reg.addon, reg.email);
    const shape = companionShape(aid, identity);
    rows.push({
      id: aid,
      form_id: opts.formId,
      name: shape.name,
      email: shape.email,
      guest_type: shape.guest_type,
      ticket_type: FREE_ADDON_TICKET_TYPE,
      qr_payload: JSON.stringify({ id: aid }),
      payment_status: 'free',
      payment_method: null,
      payment_amount: '0',
      // Not uniqueness-enforced (the partial index covers razorpay rows only),
      // but it ties the free seat back to the payment that bought it, which is
      // what an admin reconciling a booking actually needs.
      transaction_id: `${txnBase}-p${groupCount + 2}`,
      pricing_template_id: opts.pricingTemplateId,
      is_test: !!opts.isTest,
      is_primary: false,
      primary_attendee_id: primaryId,
      registered_at: nowIso,
      answers: shape.answers,
      admin_notes: evidence,
    });
    track(aid, shape, !!identity.email);
  }

  return { ok: true, rows, primaryId, txnBase, companions };
}
