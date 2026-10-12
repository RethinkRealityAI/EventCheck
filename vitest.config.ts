import { defineConfig } from 'vitest/config';

// services/supabaseClient.ts throws at import without a URL, and the email
// tracking helpers build no links without one. No test talks to Supabase, so
// any value works — placeholders let a clean checkout run `npm test` with no
// env set. Set on process.env at config load (not via `test.env`) so Vite's
// own env loading sees them too: `(import.meta as any).env` reads in
// utils/emailTracking.ts only pick up variables present at startup. A real
// value from the environment still wins.
process.env.VITE_SUPABASE_URL ||= 'http://localhost:54321';
process.env.VITE_SUPABASE_ANON_KEY ||= 'test-anon-key';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
