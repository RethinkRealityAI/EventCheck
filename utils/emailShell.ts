// Canonical email shell lives in supabase/functions/_shared/emailShell.ts so the
// Deno edge function (send-ticket-email) and the Vite client render byte-identical
// emails from ONE source. This re-export keeps the historical import path
// (`utils/emailShell`) working for all existing client call sites.
export * from '../supabase/functions/_shared/emailShell';
