import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { QrCode, Mail, Lock, Loader2, ChevronRight } from 'lucide-react';
import { useNotifications } from './NotificationSystem';
import { useNavigate } from 'react-router-dom';
import { CURRENT_SITE } from '../config/sites';
import { useAuth } from './AuthContext';

const Login = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const { showNotification } = useNotifications();
    const navigate = useNavigate();
    const { user, profile, loading: authLoading } = useAuth();

    // If already signed in, send the user where they belong instead of
    // making them re-authenticate. Admins → /admin; non-admins on portal
    // sites → /portal; non-admins on non-portal sites → /.
    useEffect(() => {
        if (authLoading || !user) return;
        // super_admin and admin both land in /admin. Anyone else → portal/home.
        if (profile?.role === 'admin' || profile?.role === 'super_admin') {
            navigate('/admin', { replace: true });
        } else if (profile !== null) {
            navigate(CURRENT_SITE.portalEnabled ? '/portal' : '/', { replace: true });
        }
    }, [user, profile, authLoading, navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                showNotification(error.message, 'error');
            } else if (data.session) {
                showNotification('Logged in successfully', 'success');
                navigate('/admin');
            }
        } catch (error: any) {
            showNotification('An unexpected error occurred', 'error');
        } finally {
            setLoading(false);
        }
    };

    const primary = CURRENT_SITE.fallbackColors.primary;
    const accent = CURRENT_SITE.fallbackColors.accent;

    return (
        <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Abstract Background Elements (per-site colors) */}
            <div
                className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full opacity-20"
                style={{ backgroundColor: primary }}
            />
            <div
                className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] blur-[120px] rounded-full opacity-20"
                style={{ backgroundColor: accent }}
            />

            <div className="w-full max-w-[420px] relative z-10">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div
                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl shadow-xl mb-4"
                        style={{ backgroundColor: primary, boxShadow: `0 20px 25px -5px ${primary}33` }}
                    >
                        {CURRENT_SITE.logoImage ? (
                            <img src={CURRENT_SITE.logoImage} alt={CURRENT_SITE.displayName} className="w-9 h-9 object-contain" />
                        ) : (
                            <QrCode className="w-8 h-8 text-white" />
                        )}
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">{CURRENT_SITE.displayName}</h1>
                    <p className="text-slate-400 font-medium">Admin Portal Access</p>
                </div>

                {/* Login Form */}
                <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl">
                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Email Address</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Mail className="h-5 w-5 text-slate-500 transition-colors" />
                                </div>
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-800/50 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                                    style={{ ['--tw-ring-color' as any]: `${primary}80` }}
                                    placeholder={`admin@${CURRENT_SITE.supportEmail.split('@')[1] ?? 'example.com'}`}
                                    required
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-300 mb-2 ml-1">Password</label>
                            <div className="relative group">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                    <Lock className="h-5 w-5 text-slate-500 transition-colors" />
                                </div>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-800/50 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 transition-all"
                                    style={{ ['--tw-ring-color' as any]: `${primary}80` }}
                                    placeholder="••••••••"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full relative group overflow-hidden disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-all active:scale-[0.98]"
                            style={{
                                backgroundColor: loading ? undefined : primary,
                                boxShadow: loading ? undefined : `0 10px 15px -3px ${primary}33`,
                            }}
                        >
                            <div className="relative flex items-center justify-center gap-2">
                                {loading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <>
                                        Sign In to Dashboard
                                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                    </>
                                )}
                            </div>
                        </button>
                    </form>

                    <div className="mt-8 pt-6 border-t border-slate-800 text-center">
                        <p className="text-sm text-slate-500">
                            Forgot your credentials? <br />
                            <span className="text-slate-400 font-medium">Contact {CURRENT_SITE.supportEmail}</span>
                        </p>
                    </div>
                </div>

                {/* Footer Info */}
                <p className="text-center mt-8 text-slate-600 text-xs font-medium uppercase tracking-[0.2em]">
                    Secured by Supabase Auth
                </p>
            </div>
        </div>
    );
};

export default Login;
