import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { User, Session } from '@supabase/supabase-js';
import type { Profile } from '../types';
import { fetchProfile } from '../services/profileService';
import { handleSupabaseAuthCallback } from '../utils/authHashCallback';

interface AuthContextType {
    user: User | null;
    session: Session | null;
    loading: boolean;
    signOut: () => Promise<void>;
    profile: Profile | null;
    refreshProfile: () => Promise<void>;
    /** Set when an email-confirm / magic-link redirect fails (e.g. otp_expired). */
    authNotice: string | null;
    clearAuthNotice: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    loading: true,
    signOut: async () => { },
    profile: null,
    refreshProfile: async () => { },
    authNotice: null,
    clearAuthNotice: () => { },
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [authNotice, setAuthNotice] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const init = async () => {
            // Email-confirm links land as /#/portal?code=… — exchange before getSession.
            const callback = await handleSupabaseAuthCallback(supabase);
            if (callback.status === 'error' && !cancelled) {
                setAuthNotice(callback.errorMessage ?? 'Email verification failed.');
            } else if (callback.status === 'success' && !cancelled) {
                setAuthNotice(null);
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (cancelled) return;
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        };

        void init();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => {
            cancelled = true;
            subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!session?.user?.id) { setProfile(null); return; }
        fetchProfile(session.user.id).then(setProfile);
    }, [session?.user?.id]);

    const refreshProfile = async () => {
        if (!session?.user?.id) return;
        const p = await fetchProfile(session.user.id);
        setProfile(p);
    };

    const signOut = async () => {
        try {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('gansid-portal-stepper:')) keys.push(key);
            }
            for (const k of keys) localStorage.removeItem(k);
        } catch {
            /* ignore — best-effort sweep */
        }
        await supabase.auth.signOut();
    };

    return (
        <AuthContext.Provider value={{
            user,
            session,
            loading,
            signOut,
            profile,
            refreshProfile,
            authNotice,
            clearAuthNotice: () => setAuthNotice(null),
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
