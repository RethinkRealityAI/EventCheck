// Turn an email-send failure into something an admin can act on.
//
// THE PROBLEM THIS SOLVES (2026-08-19)
// An admin reported "we can no longer send reminder emails — Edge 200 error".
// The real cause was an SMTP rejection: `550 You have reached your daily email
// sending quota.` Nothing in the product said so.
//
// Two layers hid it:
//   1. supabase-js sets `error.message` to the generic "Edge Function returned
//      a non-2xx status code" and puts the actual response body in
//      `error.context`. Callers that read `.message` show the generic string.
//   2. The send path only logs to `email_sends` AFTER a success, so a failed
//      send leaves no trace anywhere — the same blind spot that hid the
//      payment failures until `payment_failures` was added.
//
// A quota error is not a bug, but it IS operationally urgent: every subsequent
// send fails until the cap resets. Telling the admin exactly that turns a
// support ticket into a self-service fix.

export type EmailFailureKind =
  | 'quota'
  | 'auth'
  | 'connection'
  | 'recipient'
  | 'not-configured'
  | 'unknown';

export interface EmailFailure {
  kind: EmailFailureKind;
  /** Sentence shown to the admin. Says what happened AND what to do. */
  message: string;
  /** The raw provider text, for the details line / logs. */
  raw: string;
}

/**
 * Pull the real error out of a supabase-js FunctionsHttpError.
 *
 * `invoke()` returns `data: null` and an error whose `.message` is always the
 * same generic string; the useful body is on `.context` (a Response). Callers
 * must await `.json()` — which is why so many places surfaced the generic text.
 */
export async function extractInvokeError(error: unknown): Promise<string> {
  const generic = 'Edge Function returned a non-2xx status code';
  const msg = (error as any)?.message ? String((error as any).message) : '';
  const ctx = (error as any)?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      const detail = body?.error ?? body?.message;
      if (detail) return String(detail);
    } catch {
      try {
        const text = typeof ctx.text === 'function' ? await ctx.text() : '';
        if (text) return String(text);
      } catch { /* fall through to the message */ }
    }
  }
  return msg && msg !== generic ? msg : generic;
}

/** Classify a raw SMTP/provider error into an actionable admin message. */
export function classifyEmailFailure(raw: string): EmailFailure {
  const text = String(raw ?? '').trim();
  const low = text.toLowerCase();

  // 550 quota / rate limits. Providers word this several ways: IONOS says
  // "daily email sending quota", Resend rate-limits, SES says "sending quota
  // exceeded". All mean the same thing to an admin: stop, wait or upgrade.
  if (
    low.includes('daily email sending quota') ||
    low.includes('sending quota') ||
    low.includes('quota exceeded') ||
    low.includes('rate limit') ||
    low.includes('too many emails') ||
    low.includes('message rate') ||
    /\b(429|452|4\.7\.0)\b/.test(low)
  ) {
    return {
      kind: 'quota',
      message:
        'Your email provider has refused further messages because the sending limit for this period has been reached. '
        + 'Nothing is broken and no registration data was affected — but no further emails will go out until the limit resets or the plan is upgraded. '
        + 'Check the sending provider’s dashboard for the current cap and usage.',
      raw: text,
    };
  }

  if (
    low.includes('authentication') || low.includes('auth failed') ||
    low.includes('invalid login') || low.includes('535') || low.includes('username and password')
  ) {
    return {
      kind: 'auth',
      message:
        'The email provider rejected our sign-in credentials. Check the SMTP username and password/API key for this site.',
      raw: text,
    };
  }

  if (
    low.includes('econnrefused') || low.includes('etimedout') || low.includes('enotfound') ||
    low.includes('connection') || low.includes('socket')
  ) {
    return {
      kind: 'connection',
      message:
        'We could not reach the email provider. This is usually temporary — try again in a few minutes.',
      raw: text,
    };
  }

  if (
    low.includes('recipient') || low.includes('mailbox') ||
    low.includes('user unknown') || low.includes('550 5.1.1')
  ) {
    return {
      kind: 'recipient',
      message:
        'The provider rejected the recipient address. Check the email address on this record for a typo.',
      raw: text,
    };
  }

  if (low.includes('smtp credentials are not configured') || low.includes('missing to/subject/html')) {
    return {
      kind: 'not-configured',
      message: text,
      raw: text,
    };
  }

  return {
    kind: 'unknown',
    message: text || 'The email could not be sent.',
    raw: text,
  };
}

/**
 * Should a bulk run stop rather than continue?
 *
 * Once the provider is refusing on quota or credentials, every remaining
 * recipient will fail the same way. Continuing burns time and produces a wall
 * of identical errors — and on a metered plan can deepen the overage.
 */
export function shouldAbortBulkSend(kind: EmailFailureKind): boolean {
  return kind === 'quota' || kind === 'auth' || kind === 'not-configured';
}
