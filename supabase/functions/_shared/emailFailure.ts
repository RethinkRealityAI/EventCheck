// Classify an email-send failure into something a human can act on.
//
// Canonical implementation, shared by the browser (via
// utils/emailSendErrors.ts) and the Deno edge runtime — the edge bundler only
// uploads files under supabase/functions, so anything send-ticket-email needs
// has to live here. Same pattern as emailShell / ticketPdf / attendeeDisplayName.
//
// WHY IT EXISTS (2026-08-19)
// An admin reported reminder emails failing with an unexplained edge-function
// error. The real cause was `550 You have reached your daily email sending
// quota.` after 163 sends in one morning. Nothing surfaced it and nothing
// recorded it, so diagnosing it meant reproducing the failure by hand against
// production. The classification is now written to `email_failures` at the
// point of failure AND shown to the admin.
//
// Pure — no I/O, no DOM, no Deno APIs.

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
    return { kind: 'not-configured', message: text, raw: text };
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

/**
 * Shape the `email_failures` row.
 *
 * Deliberately carries NO message body and NO credentials — just enough to
 * trace an attempt back to a person, a template and a provider response.
 */
export function buildEmailFailureRow(input: {
  mode?: string;
  templateKey?: string;
  recipient?: string;
  formId?: string;
  attendeeId?: string;
  subject?: string;
  rawError: string;
}): Record<string, unknown> {
  const failure = classifyEmailFailure(input.rawError);
  const trim = (v: unknown, max = 2000) => {
    const s = v === undefined || v === null ? null : String(v);
    return s === null || s === '' ? null : s.slice(0, max);
  };
  return {
    mode: trim(input.mode, 64),
    template_key: trim(input.templateKey, 64),
    recipient: trim(input.recipient, 320),
    form_id: trim(input.formId, 128),
    attendee_id: trim(input.attendeeId, 128),
    kind: failure.kind,
    message: trim(failure.raw),
    subject: trim(input.subject, 500),
  };
}
