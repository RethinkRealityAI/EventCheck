import { useAuth } from './AuthContext';

/** Global banner for failed email-confirm / magic-link redirects (e.g. otp_expired). */
export function AuthNoticeBanner({ className = '' }: { className?: string }) {
  const { authNotice, clearAuthNotice } = useAuth();
  if (!authNotice) return null;

  return (
    <div className={`max-w-3xl mx-auto px-6 pt-6 relative z-10 ${className}`.trim()}>
      <div className="rounded-gansid-lg border border-gansid-primary/30 bg-gansid-primary-container/10 px-4 py-3 text-sm text-gansid-on-surface font-body">
        <p>{authNotice}</p>
        <button
          type="button"
          onClick={clearAuthNotice}
          className="mt-2 text-gansid-primary font-semibold hover:underline"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
