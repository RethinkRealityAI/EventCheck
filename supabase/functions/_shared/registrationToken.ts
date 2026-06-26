// Stateless HMAC-signed token for the public ticket-download page.
// Pure functions — secret + clock are passed in — so the SAME module is
// importable by the edge function (Deno) AND the vitest suite (node>=18).
// Uses only Web Crypto + btoa/atob/TextEncoder (present in both runtimes).
// No Deno-specific imports may be added to this file.

export interface RegistrationTokenPayload {
  a: string; // primary attendee id
  f: string; // form id
  iat: number; // issued-at (ms epoch)
  exp: number; // expiry (ms epoch)
}

export type VerifyResult =
  | { valid: true; primaryAttendeeId: string; formId: string }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' };

function b64urlEncode(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecodeToString(s: string): string {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

async function hmacBase64Url(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return b64urlEncode(new Uint8Array(sig));
}

// Constant-time string compare (equal-length base64url signatures).
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function signRegistrationToken(
  primaryAttendeeId: string,
  formId: string,
  secret: string,
  nowMs: number,
  ttlMs: number,
): Promise<string> {
  const payload: RegistrationTokenPayload = {
    a: primaryAttendeeId,
    f: formId,
    iat: nowMs,
    exp: nowMs + ttlMs,
  };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(secret, body);
  return `${body}.${sig}`;
}

export async function verifyRegistrationToken(
  token: string,
  secret: string,
  nowMs: number,
): Promise<VerifyResult> {
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { valid: false, reason: 'malformed' };
  }
  const [body, sig] = parts;

  let payload: RegistrationTokenPayload;
  try {
    payload = JSON.parse(b64urlDecodeToString(body));
  } catch {
    return { valid: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.a !== 'string' || typeof payload.f !== 'string'
      || typeof payload.exp !== 'number') {
    return { valid: false, reason: 'malformed' };
  }

  const expected = await hmacBase64Url(secret, body);
  if (!timingSafeEqual(sig, expected)) {
    return { valid: false, reason: 'bad-signature' };
  }
  if (nowMs > payload.exp) return { valid: false, reason: 'expired' };

  return { valid: true, primaryAttendeeId: payload.a, formId: payload.f };
}

// ── Invite token (kind='invite') ─────────────────────────────────────────────
// Encodes { contactId, formId } for the free invite-registration flow.
// Distinct from the download token (which encodes { primaryAttendeeId, formId }
// and has no `k` field) so the two cannot be cross-used:
//   - A download token parsed by verifyInviteToken has k=undefined → 'wrong-kind'
//   - An invite token parsed by verifyRegistrationToken has a=undefined → 'malformed'
// Signature is checked BEFORE k/exp so a forged-kind token fails on sig first.

export interface InviteTokenPayload {
  k: 'invite';
  c: string; // imported_contacts id
  f: string; // form id
  iat: number;
  exp: number;
}

export type InviteVerifyResult =
  | { valid: true; contactId: string; formId: string }
  | { valid: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-kind' };

export async function signInviteToken(
  contactId: string, formId: string, secret: string, nowMs: number, ttlMs: number,
): Promise<string> {
  const payload: InviteTokenPayload = { k: 'invite', c: contactId, f: formId, iat: nowMs, exp: nowMs + ttlMs };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await hmacBase64Url(secret, body);
  return `${body}.${sig}`;
}

export async function verifyInviteToken(
  token: string, secret: string, nowMs: number,
): Promise<InviteVerifyResult> {
  if (typeof token !== 'string') return { valid: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { valid: false, reason: 'malformed' };
  const [body, sig] = parts;
  // Parse to a generic record first — just enough to verify the signature.
  // We intentionally avoid checking invite-specific fields (c, f) until AFTER
  // the signature check, so that a valid download token (wrong kind, right sig)
  // returns 'wrong-kind' rather than 'malformed'.
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(b64urlDecodeToString(body)); }
  catch { return { valid: false, reason: 'malformed' }; }
  if (!raw || typeof raw.exp !== 'number') return { valid: false, reason: 'malformed' };
  // Signature check BEFORE k/exp — a forged-kind token still fails on signature first.
  const expected = await hmacBase64Url(secret, body);
  if (!timingSafeEqual(sig, expected)) return { valid: false, reason: 'bad-signature' };
  if (raw.k !== 'invite') return { valid: false, reason: 'wrong-kind' };
  if (nowMs > (raw.exp as number)) return { valid: false, reason: 'expired' };
  if (typeof raw.c !== 'string' || typeof raw.f !== 'string') return { valid: false, reason: 'malformed' };
  return { valid: true, contactId: raw.c as string, formId: raw.f as string };
}
