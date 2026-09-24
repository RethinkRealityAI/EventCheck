// Who may make send-ticket-email deliver content they wrote themselves.
//
// send-ticket-email's gateway is open (verify_jwt = false) because public
// flows — a registrant's own confirmation, a guest claiming a seat — call it
// with no session. Most modes are safe that way: they load a row by id and
// render OUR template to THAT row's address. These modes are not:
//
//   raw-html                 { to, subject, html }
//   contact-register-invite  { to, subject, html }
//   custom-ticket            { attendeeId, subject, body } — admin-written copy
//                            wrapped around a real ticket
//
// Each delivers caller-supplied HTML — to a caller-supplied address, or to any
// attendee the caller names — from the congress sender, with our SMTP
// reputation behind it. Unauthenticated, that is an open relay: anyone who
// finds the function URL could send a convincing "GANSID Congress" email
// linking anywhere. Every legitimate
// caller is either another edge function (service-role key) or an admin in
// the dashboard (their session JWT), so those are the only two accepted.

export const CALLER_CONTENT_MODES: ReadonlySet<string> = new Set(['raw-html', 'contact-register-invite', 'custom-ticket']);

export const SENDER_ROLES: ReadonlySet<string> = new Set(['admin', 'super_admin']);

/** The bearer token from an Authorization header, or '' when there is none. */
export function bearerToken(header: string | null | undefined): string {
  const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(header ?? '');
  return m ? m[1] : '';
}

/** Length-independent comparison, so the service key can't be probed by timing. */
export function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export type SenderVerdict = 'service' | 'admin' | 'denied';

/**
 * `lookupRole` resolves a user JWT to that user's profile role (or null).
 * Injected so the decision itself is testable without a Supabase client.
 */
export async function authorizeCallerContentSend(
  authorizationHeader: string | null | undefined,
  serviceKey: string,
  lookupRole: (jwt: string) => Promise<string | null>,
): Promise<SenderVerdict> {
  const token = bearerToken(authorizationHeader);
  if (!token) return 'denied';
  if (serviceKey && constantTimeEqual(token, serviceKey)) return 'service';
  try {
    const role = await lookupRole(token);
    return role && SENDER_ROLES.has(role) ? 'admin' : 'denied';
  } catch {
    return 'denied';
  }
}
