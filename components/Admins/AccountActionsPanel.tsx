import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Mail, ShieldCheck, UserPlus, Copy, Check, Loader2, AlertCircle, Link2 } from 'lucide-react';
import {
  lookupUser,
  sendPasswordReset,
  sendMagicLink,
  setUserPassword,
  confirmUserEmail,
  createPortalAccount,
  type AdminUserLookup,
} from '../../services/adminUserActionsService';
import { useNotifications } from '../NotificationSystem';
import { useAuth } from '../AuthContext';
import { canUseFeature, isSuperAdmin } from '../../utils/adminPermissions';

interface AccountActionsPanelProps {
  email: string;
  /** Used as the new account's full_name when creating one. */
  fullName?: string;
  /** Compact styling for embedding inside the attendee modal. */
  dense?: boolean;
}

/**
 * Dashboard-side portal-account management for one email address: check whether
 * an account exists, send a reset or magic link, confirm the address, create an
 * account, or (super admin only) set a password outright.
 *
 * Server-side rules live in the `admin-user-actions` edge function — this only
 * decides what to SHOW. Anything hidden here is still refused by the server.
 */
const AccountActionsPanel: React.FC<AccountActionsPanelProps> = ({ email, fullName, dense }) => {
  const { profile } = useAuth();
  const { showNotification } = useNotifications();

  const [status, setStatus] = useState<AdminUserLookup | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [issuedLink, setIssuedLink] = useState<{ label: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');

  const canManage = canUseFeature(profile, 'manageUsers');
  const canSetPassword = isSuperAdmin(profile);
  const trimmedEmail = (email || '').trim();

  const refresh = useCallback(async () => {
    if (!trimmedEmail) return;
    setLoading(true);
    setError(null);
    try {
      setStatus(await lookupUser(trimmedEmail));
    } catch (e: any) {
      setError(e.message || 'Could not check this account.');
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [trimmedEmail]);

  useEffect(() => {
    if (!canManage) return;
    // Reset per-email state so a reused panel never shows the previous
    // attendee's link or password.
    setIssuedLink(null);
    setNewPassword('');
    setShowSetPassword(false);
    refresh();
  }, [canManage, refresh]);

  if (!canManage) return null;

  if (!trimmedEmail) {
    return (
      <div className="text-xs text-gray-500 italic">No email on this record — account actions unavailable.</div>
    );
  }

  const run = async (key: string, fn: () => Promise<any>, onDone: (r: any) => void) => {
    setBusy(key);
    setError(null);
    try {
      onDone(await fn());
    } catch (e: any) {
      setError(e.message || 'Action failed.');
    } finally {
      setBusy(null);
    }
  };

  const copyLink = async () => {
    if (!issuedLink) return;
    try {
      await navigator.clipboard.writeText(issuedLink.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showNotification('Could not copy — select the link and copy manually.', 'warning');
    }
  };

  const linkResult = (label: string) => (r: any) => {
    setIssuedLink({ label, value: r.link });
    if (r.emailSent) showNotification(`${label} emailed to ${trimmedEmail}`, 'success');
    else showNotification(`${label} created — email didn't send${r.emailError ? ` (${r.emailError})` : ''}. Copy the link below and share it directly.`, 'warning');
    refresh();
  };

  const btn = 'inline-flex items-center justify-center gap-1.5 rounded-xl border font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed';
  const size = dense ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs';
  const neutral = `${btn} ${size} bg-white border-gray-200 text-gray-700 hover:bg-gray-50`;
  const accent = `${btn} ${size} bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100`;

  const Spinner = ({ on }: { on: boolean }) => (on ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null);

  return (
    <div className={`rounded-2xl border border-gray-200 bg-gray-50/70 ${dense ? 'p-3' : 'p-4'} space-y-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
          <KeyRound className="w-3.5 h-3.5" /> Portal account
        </div>
        {loading ? (
          <span className="text-[11px] text-gray-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> checking…</span>
        ) : status ? (
          status.exists ? (
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${status.emailConfirmed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
              {status.emailConfirmed ? 'Active' : 'Unverified'}
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">No account</span>
          )
        ) : null}
      </div>

      <div className="text-[11px] text-gray-500 break-all">{trimmedEmail}</div>

      {status?.exists && (
        <div className="text-[11px] text-gray-500">
          {status.lastSignInAt
            ? <>Last sign-in {new Date(status.lastSignInAt).toLocaleString()}</>
            : <>Never signed in</>}
          {status.role && status.role !== 'attendee' && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-semibold uppercase text-[9px]">{status.role}</span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> <span>{error}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {status?.exists ? (
          <>
            <button
              className={accent}
              disabled={!!busy}
              onClick={() => run('reset', () => sendPasswordReset(trimmedEmail), linkResult('Password reset link'))}
            >
              <Spinner on={busy === 'reset'} /> <Mail className="w-3.5 h-3.5" /> Send password reset
            </button>
            <button
              className={accent}
              disabled={!!busy}
              onClick={() => run('magic', () => sendMagicLink(trimmedEmail), linkResult('Sign-in link'))}
            >
              <Spinner on={busy === 'magic'} /> <Link2 className="w-3.5 h-3.5" /> Send sign-in link
            </button>
            {!status.emailConfirmed && (
              <button
                className={neutral}
                disabled={!!busy}
                onClick={() => run('confirm', () => confirmUserEmail(trimmedEmail), () => {
                  showNotification('Email address confirmed — they can sign in now.', 'success');
                  refresh();
                })}
              >
                <Spinner on={busy === 'confirm'} /> <ShieldCheck className="w-3.5 h-3.5" /> Mark email confirmed
              </button>
            )}
            {canSetPassword && (
              <button className={neutral} disabled={!!busy} onClick={() => setShowSetPassword(v => !v)}>
                <KeyRound className="w-3.5 h-3.5" /> Set password
              </button>
            )}
          </>
        ) : status ? (
          <button
            className={accent}
            disabled={!!busy}
            onClick={() => run('create', () => createPortalAccount(trimmedEmail, fullName), (r) => {
              setIssuedLink({ label: `Temporary password for ${trimmedEmail}`, value: r.tempPassword });
              showNotification('Portal account created — share the temporary password below.', 'success');
              refresh();
            })}
          >
            <Spinner on={busy === 'create'} /> <UserPlus className="w-3.5 h-3.5" /> Create portal account
          </button>
        ) : null}
      </div>

      {showSetPassword && canSetPassword && status?.exists && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            type="text"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="New password (min. 8 characters)"
            className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <button
            className={accent}
            disabled={!!busy || newPassword.length < 8}
            onClick={() => run('setpw', () => setUserPassword(trimmedEmail, newPassword), () => {
              showNotification('Password updated — share it with them directly.', 'success');
              setIssuedLink({ label: `Password for ${trimmedEmail}`, value: newPassword });
              setNewPassword('');
              setShowSetPassword(false);
            })}
          >
            <Spinner on={busy === 'setpw'} /> Save password
          </button>
        </div>
      )}

      {issuedLink && (
        <div className="rounded-xl border border-indigo-100 bg-white p-2.5 space-y-1.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">{issuedLink.label}</div>
          <div className="flex items-start gap-2">
            <code className="flex-1 text-[11px] text-gray-700 break-all leading-relaxed">{issuedLink.value}</code>
            <button onClick={copyLink} className="shrink-0 p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50" title="Copy">
              {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5 text-gray-500" />}
            </button>
          </div>
          <div className="text-[10px] text-gray-400">Single-use and time-limited. Share it directly if the email didn't arrive.</div>
        </div>
      )}
    </div>
  );
};

export default AccountActionsPanel;
