// Which registrations came to us through TSCS India — the partner that sells
// GANSID Congress places on its own website and forwards them (the email feed,
// and the delegate lists registered by hand).
//
// Every TSCS door stamps at least one `tscs_*` answer key (tscs_source,
// tscs_ref, tscs_payment_id, tscs_message_id), companions included. District
// medical team delegates (attendee_category 'dmho') also came via TSCS but
// have their own DMHOs tab and desk process, so they are not counted here.
//
// Pure + data-only so it is unit-tested.

export const TSCS_ANSWER_KEYS = ['tscs_source', 'tscs_ref', 'tscs_payment_id', 'tscs_message_id'] as const;

export interface TscsSource {
  answers?: Record<string, unknown> | null;
  attendeeCategory?: string | null;
  isTest?: boolean | null;
}

export function isTscsRegistration(a: TscsSource): boolean {
  if (a.isTest) return false;
  if (a.attendeeCategory === 'dmho') return false;
  const answers = a.answers ?? {};
  return TSCS_ANSWER_KEYS.some(k => {
    const v = answers[k];
    return v != null && String(v).trim() !== '';
  });
}

/** TSCS's own booking reference (e.g. "REG-00141"), when we have it. */
export function tscsRefOf(a: TscsSource): string {
  const v = a.answers?.tscs_ref;
  return typeof v === 'string' ? v.trim() : '';
}
