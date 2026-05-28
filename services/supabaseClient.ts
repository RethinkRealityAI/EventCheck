import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase environment variables are missing!");
}

import { Database } from './database.types';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // HashRouter apps parse `/#/route?code=` manually in utils/authHashCallback.ts.
    detectSessionInUrl: false,
    flowType: 'pkce',
    persistSession: true,
  },
});
