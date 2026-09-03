// Parser for TSCS India registration-confirmation emails.
//
// India congress registrations are collected on the partner's page
// (tscsindia.org/gansid-registration) via their Razorpay account. Our only
// automated signal is the confirmation email their WordPress sends to our
// IONOS mailbox — this module turns that email into a normalized
// registration record the ingest function can act on.
//
// Two formats, tried in order:
//  1. A machine block we asked TSCS to embed in the email body:
//       <!-- GANSID-JSON {"email":"...","first_name":...} -->
//     (also accepted without the comment wrapper, or in a ```GANSID-JSON``` fence)
//  2. Label/value lines ("First Name: …", "Category: …", "Payment ID: pay_…")
//     as email templates usually render form fields. Label synonyms are
//     handled; unknown labels are ignored.
//
// Dependency-free on purpose (mirrors flutterwaveVerify.ts) so it unit-tests
// under vitest without any Deno/IMAP machinery.

export interface TscsGroupMember {
  name: string;
  email?: string;
  institution?: string;
  role?: string;
  category?: string;
  attending_days?: string;
  /** Per-member fee in ₹ when the payload provides it (the TSCS form computes one). */
  fee?: number;
}

export interface TscsRegistration {
  first_name?: string;
  last_name?: string;
  /** Always present when ok: joined first/last or the single Name field. */
  name: string;
  email: string;
  phone?: string;
  city?: string;
  institution?: string;
  role?: string;
  category: string;
  attending_days?: string;
  registration_type?: 'individual' | 'group';
  participants?: number;
  total_inr?: number;
  payment_id?: string;
  group?: TscsGroupMember[];
  addon?: { name?: string; email?: string };
}

export type TscsPaymentState = 'confirmed' | 'pending' | 'unknown';

/**
 * Does this email evidence a COMPLETED payment?
 *
 * TSCS sends a "[PENDING] Incomplete Registration" mail when someone starts
 * checkout and abandons it. It is structurally IDENTICAL to the confirmation —
 * same table, same fields, same registrant — so parsing alone cannot tell them
 * apart, and ingesting one issues a congress ticket to somebody who never paid.
 * The only reliable separators are the subject marker and the presence of a
 * Razorpay transaction id, so both are checked and anything ambiguous is
 * reported as 'unknown' for a human rather than guessed at.
 */
export function paymentStateOf(args: {
  subject?: string;
  text?: string;
  html?: string;
  paymentId?: string;
}): TscsPaymentState {
  const subject = args.subject || '';
  const body = `${args.text || ''}\n${args.html || ''}`;
  // Pending wins over every positive marker: the pending mail also contains
  // the word "Registration" and a full details table.
  if (/\[\s*PENDING\s*\]|incomplete\s+registration/i.test(`${subject}\n${body}`)) return 'pending';
  if (args.paymentId) return 'confirmed';
  if (/\[\s*(?:PAID|SUCCESS)\s*\]|PAYMENT\s+CONFIRMED/i.test(`${subject}\n${body}`)) return 'confirmed';
  return 'unknown';
}

export type TscsParseResult =
  | { ok: true; registration: TscsRegistration; via: 'json' | 'labels' | 'table' }
  | { ok: false; reason: string };

/** The partner's sender must match one of these (comma-separated env). */
export function senderAllowed(fromAddr: string, allowedCsv: string): boolean {
  // Accept both bare addresses and "Display Name <addr>" forms.
  const angled = (fromAddr || '').match(/<([^>]+)>/);
  const from = (angled ? angled[1] : fromAddr || '').trim().toLowerCase();
  // '@domain' entries match the sender's domain suffix; anything else must be
  // an EXACT address match — substring matching would let
  // 'registrations@tscsindia.org.evil.in' impersonate an allowed sender.
  return allowedCsv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((allowed) => (allowed.startsWith('@') ? from.endsWith(allowed) : from === allowed));
}

/** TSCS category name → our pricing_category_id. Matches the shared list used
 *  by both their page and our pricing template (names are identical today;
 *  matching is fuzzy so cosmetic edits don't break ingestion). */
export function categoryToPricingId(category: string): string | null {
  const c = (category || '').toLowerCase();
  if (!c) return null;
  if (c.includes('physician') || c.includes('researcher')) return 'physician';
  if (c.includes('trainee') || c.includes('resident') || c.includes('fellow')) return 'trainee';
  if (c.includes('abstract')) return 'abstract_presenter';
  if (c.includes('student') || c.includes('undergraduate') || c.includes('graduate')) return 'student';
  if (c.includes('nurse') || c.includes('allied')) return 'nurse';
  if (c.includes('industry')) return 'industry';
  if (c.includes('organization') || c.includes('organisation')) return 'patient_org';
  if (c.includes('patient') || c.includes('family')) return 'patient';
  return null;
}

const LABELS: Record<string, keyof TscsRegistration | 'name_joined'> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'surname': 'last_name',
  'name': 'name_joined',
  'full name': 'name_joined',
  'email': 'email',
  'email address': 'email',
  'phone': 'phone',
  'phone number': 'phone',
  'whatsapp': 'phone',
  'whatsapp number': 'phone',
  'city': 'city',
  'institution': 'institution',
  'organization': 'institution',
  'organisation': 'institution',
  'institution / organization': 'institution',
  'role': 'role',
  'position': 'role',
  'role / position': 'role',
  'category': 'category',
  'registration category': 'category',
  'reg category': 'category',
  'days': 'attending_days',
  'attending days': 'attending_days',
  'days attending': 'attending_days',
  'registration type': 'registration_type',
  'participants': 'participants',
  'total': 'total_inr',
  'total fee': 'total_inr',
  'amount': 'total_inr',
  'amount paid': 'total_inr',
  'fee paid': 'total_inr',
  'payment id': 'payment_id',
  'razorpay payment id': 'payment_id',
  'transaction id': 'payment_id',
  'payment reference': 'payment_id',
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d|td)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#8377;|&#x20b9;/gi, '₹')
    .replace(/[ \t]+/g, ' ');
}

/** '₹2,400.00' → 2400; 'INR 2400.50' → 2400.5. Strips currency markers and
 *  thousands separators but PRESERVES the decimal point. Exported for the
 *  JSON path too, which must not trust string-typed amounts. */
export function parseAmount(v: string | number | undefined | null): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (v == null) return undefined;
  const cleaned = String(v)
    .replace(/₹/g, '')
    .replace(/\b(?:INR|Rs\.?|RS)\b/gi, '')
    .replace(/,/g, '')
    .trim();
  const m = cleaned.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

// ── TSCS table-template strategy ─────────────────────────────────────────────
// The live "[PAID] Registration Confirmed" emails render the details as an
// HTML table, so the text arrives as run-together label/value pairs with NO
// colons ("Full NameMs. Ashif Ahammed Emailashif@…"), sometimes wrapped
// mid-label across lines. The labels themselves are a fixed, capitalized set,
// so: join the body to one line, locate each known label (case-SENSITIVE, to
// avoid matching label words inside values), and read each value as the text
// between one label and the next.

/** Longest-first so 'Total Participants' wins over 'Participants' etc. */
const TABLE_LABELS: Array<[label: string, field: string]> = [
  ['Total Participants', 'participants'],
  ['Attending Days', 'attending_days'],
  ['Transaction ID', 'payment_id'],
  ['Pricing Tier', '_ignore'],
  ['Presentation', '_ignore'],
  ['Amount Paid', 'total_inr'],
  ['Institution', 'institution'],
  ['Full Name', 'name'],
  ['Category', 'category'],
  ['Country', '_ignore'],
  ['Email', 'email'],
  ['Phone', 'phone'],
  ['City', 'city'],
  ['Role', 'role'],
];

const HONORIFIC_RE = /^(?:mr|mrs|ms|miss|dr|prof|mx)\.?\s+/i;

/** Match an address at the START of run-together template text, e.g.
 *  'isha@gmail.comPhone8978' → 'isha@gmail.com'.
 *  Anchored on purpose: unanchored, the local-part would greedily run
 *  BACKWARDS through the preceding label ('...PolavarapuEmailisha@gmail.com').
 *  The lookahead is what stops the TLD swallowing the next label. */
function emailAtStart(s: string): string | undefined {
  const m = s.match(/^\s*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+?\.[A-Za-z]{2,63})(?=[A-Z]|\s|$)/);
  return m ? m[1] : undefined;
}

/** The "Free Addon Person" block — a complimentary companion on a paid
 *  booking. Missing it means a real person on a real payment never gets
 *  registered or ticketed, so it is parsed from the same run-together text as
 *  everything else:
 *    Free Addon Person
 *    NameIsha PolavarapuEmailisha@gmail.comPhone8978978686 */
function tryAddon(source: string): { name?: string; email?: string } | null {
  const block = source.match(
    /Free\s*Add-?on\s*Person([\s\S]*?)(?:Amount\s*Paid|Additional\s*Participants|Automated\s*notification|$)/i,
  );
  if (!block) return null;
  const chunk = block[1].replace(/\s+/g, ' ').trim();
  if (!chunk) return null;
  // Split on the label so the address is matched from its own first character.
  const afterEmail = chunk.split(/Email/i).slice(1).join('Email');
  const email = emailAtStart(afterEmail);
  // Name runs from the 'Name' label to the 'Email' label (or the end).
  const nameMatch = chunk.match(/Name\s*(.+?)\s*(?:Email|Phone|$)/i);
  const name = nameMatch ? nameMatch[1].trim().replace(HONORIFIC_RE, '') : undefined;
  if (!name && !email) return null;
  return { name, email };
}

function tryTscsTable(rawText: string, strippedHtml: string): Partial<TscsRegistration> | null {
  for (const source of [rawText, strippedHtml]) {
    if (!source || !/Full Name/.test(source)) continue;
    // Join to one line: the template wraps mid-label ("Attending\nDaysOct 23").
    const joined = source.replace(/\s+/g, ' ');
    const labelRe = new RegExp(
      `(?:^| )(${TABLE_LABELS.map(([l]) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
      'g',
    );
    const hits: Array<{ field: string; valueStart: number; labelStart: number }> = [];
    for (let m = labelRe.exec(joined); m; m = labelRe.exec(joined)) {
      const field = TABLE_LABELS.find(([l]) => l === m![1])![1];
      hits.push({ field, valueStart: m.index + m[0].length, labelStart: m.index });
    }
    if (hits.length < 3) continue;

    const reg: Partial<TscsRegistration> = {};
    for (let i = 0; i < hits.length; i++) {
      const { field, valueStart } = hits[i];
      if (field === '_ignore') continue;
      if ((reg as any)[field] !== undefined) continue; // first occurrence wins
      const end = i + 1 < hits.length ? hits[i + 1].labelStart : joined.length;
      // The footer follows the last value — cut Amount Paid at its currency.
      let value = joined.slice(valueStart, end).trim();
      if (field === 'total_inr') value = value.replace(/\bINR\b[\s\S]*$/i, 'INR');
      // A transaction id is one token; anything after the first whitespace is
      // trailing template text (e.g. the Additional Participants section).
      if (field === 'payment_id') value = value.split(/\s/)[0];
      if (!value) continue;
      if (field === 'name') (reg as any)[field] = value.replace(HONORIFIC_RE, '');
      else if (field === 'total_inr') (reg as any)[field] = parseAmount(value);
      else if (field === 'participants') (reg as any)[field] = parseInt(value, 10) || undefined;
      else (reg as any)[field] = value;
    }
    if (!reg.email) continue;

    const addon = tryAddon(source);
    if (addon?.name) reg.addon = addon;

    // "Additional Participants" block: per member, a "Participant N <name>"
    // line, then "email | phone", "Attending: …", and a category line. Parse
    // from the ORIGINAL (unjoined) source — the block relies on line structure.
    const block = source.match(/Additional Participants([\s\S]*?)(?:Amount Paid|$)/i);
    if (block) {
      const members: TscsGroupMember[] = [];
      let cur: TscsGroupMember | null = null;
      for (const rawLine of block[1].split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const p = line.match(/^Participant\s+\d+\s*[:\-]?\s*(.*)$/i);
        if (p) {
          if (cur && cur.name) members.push(cur);
          cur = { name: (p[1] || '').trim().replace(HONORIFIC_RE, '') };
          continue;
        }
        if (!cur) continue;
        if (!cur.name) { cur.name = line.replace(HONORIFIC_RE, ''); continue; }
        const att = line.match(/^Attending\s*:?\s*(.+)$/i);
        if (att) { cur.attending_days = att[1].trim(); continue; }
        if (line.includes('@')) {
          const email = line.split('|')[0].trim();
          if (email.includes('@')) cur.email = email;
          continue;
        }
        if (categoryToPricingId(line)) cur.category = line;
      }
      if (cur && cur.name) members.push(cur);
      if (members.length > 0) {
        reg.group = members;
        reg.registration_type = 'group';
      }
    }
    return reg;
  }
  return null;
}

/**
 * Try the embedded machine block first. Brace-balanced extraction — the block
 * may be followed by anything (an email footer, '-->', a fence), and in an
 * HTML body it must be found BEFORE tag-stripping (stripHtml deletes comments,
 * where the block usually lives).
 */
function tryJsonBlock(text: string): TscsRegistration | null {
  const marker = text.indexOf('GANSID-JSON');
  if (marker < 0) return null;
  const start = text.indexOf('{', marker);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          const j = JSON.parse(text.slice(start, i + 1));
          return j && typeof j === 'object' ? (j as TscsRegistration) : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function parseTscsEmail(args: {
  subject?: string;
  text?: string;
  html?: string;
}): TscsParseResult {
  const bodies = [args.text || '', args.html ? stripHtml(args.html) : ''].filter(Boolean);
  const full = bodies.join('\n');
  if (!full.trim() && !(args.html || '').trim()) return { ok: false, reason: 'empty body' };

  // The machine block usually lives in an HTML comment, which BOTH stripHtml
  // and mail clients' text rendering destroy — so look in the raw bodies first.
  let reg: Partial<TscsRegistration> | null =
    tryJsonBlock(args.text || '') || tryJsonBlock(args.html || '') || tryJsonBlock(full);
  let via: 'json' | 'labels' | 'table' = 'json';

  if (!reg) {
    via = 'labels';
    reg = {};
    const joined: Record<string, string> = {};
    for (const body of bodies) {
      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        const m = line.match(/^([A-Za-z /]+?)\s*[:：]\s*(.+)$/);
        if (!m) continue;
        const key = m[1].trim().toLowerCase();
        const field = LABELS[key];
        if (!field) continue;
        const value = m[2].trim();
        if (!value || joined[field as string]) continue; // first occurrence wins
        joined[field as string] = value;
      }
    }
    if (joined['name_joined'] && !joined['first_name']) {
      const parts = joined['name_joined'].split(/\s+/);
      joined['first_name'] = parts[0];
      joined['last_name'] = parts.slice(1).join(' ');
    }
    for (const [k, v] of Object.entries(joined)) {
      if (k === 'name_joined') continue;
      if (k === 'total_inr') (reg as any)[k] = parseAmount(v);
      else if (k === 'participants') (reg as any)[k] = parseInt(v, 10) || undefined;
      else if (k === 'registration_type') (reg as any)[k] = /group/i.test(v) ? 'group' : 'individual';
      else (reg as any)[k] = v;
    }
    // Colon-lines found nothing usable → try the live TSCS table template.
    if (!(reg as any).email) {
      const table = tryTscsTable(args.text || '', args.html ? stripHtml(args.html) : '');
      if (table) {
        reg = table;
        via = 'table';
      }
    }
  }

  // Normalize + validate the minimum viable record
  const first = (reg.first_name || '').trim();
  const last = (reg.last_name || '').trim();
  const name = (reg.name || `${first} ${last}`.trim()).trim();
  const email = (reg.email || '').trim().toLowerCase();
  const category = (reg.category || '').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, reason: 'missing or invalid email' };
  }
  if (!name) return { ok: false, reason: 'missing name' };
  if (!category) return { ok: false, reason: 'missing category' };
  if (!categoryToPricingId(category)) {
    return { ok: false, reason: `unrecognized category: ${category}` };
  }

  const registration: TscsRegistration = {
    ...(reg as TscsRegistration),
    first_name: first || undefined,
    last_name: last || undefined,
    name,
    email,
    category,
  };
  // Payment id, when present, must look like a Razorpay id or a sane token.
  if (registration.payment_id) {
    registration.payment_id = String(registration.payment_id).trim();
    if (!/^[A-Za-z0-9_.-]{6,64}$/.test(registration.payment_id)) delete registration.payment_id;
  }
  // Amounts from the JSON path can arrive as strings ('2,400') — normalize
  // through the same tolerant parser the label path uses, and never let a
  // non-numeric value survive as NaN on a paid record.
  registration.total_inr = parseAmount(registration.total_inr as any);
  if (Array.isArray(registration.group)) {
    registration.group = registration.group
      .filter((g) => g && typeof g === 'object' && (g.name || '').trim())
      .map((g) => ({
        ...g,
        name: String(g.name).trim(),
        email: g.email ? String(g.email).trim().toLowerCase() : undefined,
        fee: parseAmount(g.fee as any),
      }));
  } else {
    delete (registration as any).group;
  }
  return { ok: true, registration, via };
}
