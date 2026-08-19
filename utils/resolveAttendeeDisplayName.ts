// Canonical implementation lives in supabase/functions/_shared so the Deno
// edge runtime can use it too (the edge bundler only uploads files under
// supabase/functions). Same pattern as utils/emailShell.ts.
//
// The shared module types its inputs structurally; the real Attendee/Form/
// FormField interfaces are supersets and satisfy those shapes, so existing
// call sites and tests are unaffected.
export * from '../supabase/functions/_shared/attendeeDisplayName';
