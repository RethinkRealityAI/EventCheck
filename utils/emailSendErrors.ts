// Browser-side email-failure helpers.
//
// The CLASSIFIER is canonical in supabase/functions/_shared/emailFailure.ts so
// the edge function writes the same `kind` to `email_failures` that the admin
// sees on screen — a mismatch between those two would make the table useless
// for diagnosing what an admin actually reported. Same re-export pattern as
// utils/emailShell.ts and utils/resolveAttendeeDisplayName.ts.
export {
  classifyEmailFailure,
  shouldAbortBulkSend,
  buildEmailFailureRow,
  type EmailFailure,
  type EmailFailureKind,
} from '../supabase/functions/_shared/emailFailure';

/**
 * Pull the real error out of a supabase-js FunctionsHttpError.
 *
 * Browser-only: it depends on the shape supabase-js gives `invoke()`, which
 * returns `data: null` and an error whose `.message` is ALWAYS the generic
 * "Edge Function returned a non-2xx status code" — the useful body is on
 * `.context` (a Response) and has to be awaited. Reading only `.message` is
 * why an SMTP "550 daily sending quota" reached an admin as an unexplained
 * edge-function error.
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
