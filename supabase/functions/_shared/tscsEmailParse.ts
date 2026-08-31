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

export type TscsParseResult =
  | { ok: true; registration: TscsRegistration; via: 'json' | 'labels' }
  | { ok: false; reason: string };

/** The partner's sender must match one of these (comma-separated env). */
export function senderAllowed(fromAddr: string, allowedCsv: string): boolean {
  // Accept both bare addresses and "Display Name <addr>" forms.
  const angled = (fromAddr || '').match(/<([^>]+)>/);
  const from = (angled ? angled[1] : fromAddr || '').trim().toLowerCase();
  return allowedCsv
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .some((allowed) => (allowed.startsWith('@') ? from.endsWith(allowed) : from.includes(allowed)));
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

function parseAmount(v: string): number | undefined {
  const m = v.replace(/[₹,\sINRrsRS.]{0,3}(?=\d)/g, '').match(/([\d,]+(?:\.\d{1,2})?)/);
  if (!m) return undefined;
  const n = parseFloat(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

/** Try the embedded machine block first. */
function tryJsonBlock(text: string): TscsRegistration | null {
  const m = text.match(/GANSID-JSON[^{]*({[\s\S]*?})\s*(?:-->|```|$)/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[1]);
    if (!j || typeof j !== 'object') return null;
    return j as TscsRegistration;
  } catch {
    return null;
  }
}

export function parseTscsEmail(args: {
  subject?: string;
  text?: string;
  html?: string;
}): TscsParseResult {
  const bodies = [args.text || '', args.html ? stripHtml(args.html) : ''].filter(Boolean);
  const full = bodies.join('\n');
  if (!full.trim()) return { ok: false, reason: 'empty body' };

  let reg: Partial<TscsRegistration> | null = tryJsonBlock(full);
  let via: 'json' | 'labels' = 'json';

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
  if (Array.isArray(registration.group)) {
    registration.group = registration.group
      .filter((g) => g && typeof g === 'object' && (g.name || '').trim())
      .map((g) => ({ ...g, name: String(g.name).trim(), email: g.email ? String(g.email).trim().toLowerCase() : undefined }));
  } else {
    delete (registration as any).group;
  }
  return { ok: true, registration, via };
}
