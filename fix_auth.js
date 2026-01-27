import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://iigbgbgakevcgilucvbs.supabase.co';
const supabaseAnonKey = 'sb_publishable_aC-l5QyFLvfzX1fW3wyyHQ_g25ruM6m';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function fixUser() {
    const email = 'gala@sicklecellanemia.ca';
    const password = 'Sc@goGala26';

    console.log(`Re-attempting signup for: ${email} to see if disabled verification applies...`);
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error('Error:', error.message);
    } else {
        console.log('Success! User details:', data.user?.id);
        if (data.user?.email_confirmed_at) {
            console.log('User is now confirmed!');
        } else {
            console.log('User is still NOT confirmed. Manual intervention needed.');
        }
    }
}

fixUser();
