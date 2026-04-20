// components/Admins/AdminsManagement.tsx
//
// Super-admin-only UI at /admin/admins. Lists all admin + super_admin
// profiles, lets the caller invite new admins, promote existing users, edit
// permissions, and demote. Route gating in App.tsx guards access — this
// component assumes the caller is already a super_admin.

import { useEffect, useState } from 'react';
import { Loader2, UserPlus, Search, Trash2, Shield, AlertCircle, X, Check, Copy, Key } from 'lucide-react';
import type { Profile, AdminPermissions } from '../../types';
import {
  listAdminProfiles,
  findProfileByEmail,
  promoteToAdmin,
  updateAdminPermissions,
  demoteAdmin,
  inviteAdmin,
} from '../../services/adminManagementService';
import {
  ADMIN_PAGE_KEYS,
  ADMIN_PAGE_LABELS,
  DEFAULT_ADMIN_PERMISSIONS,
  FALLBACK_ADMIN_PERMISSIONS,
  isSuperAdmin,
  type AdminPageKey,
} from '../../utils/adminPermissions';
import { useAuth } from '../AuthContext';
import { useNotifications } from '../NotificationSystem';

// ---------------------------------------------------------------------------
// Permissions checkbox grid — used by Invite, Promote, and Edit
// ---------------------------------------------------------------------------

function PermissionsGrid({
  value,
  onChange,
  disabled,
}: {
  value: AdminPermissions;
  onChange: (next: AdminPermissions) => void;
  disabled?: boolean;
}) {
  const toggle = (key: AdminPageKey) => {
    onChange({
      ...value,
      pages: { ...value.pages, [key]: !value.pages[key] },
    });
  };
  const setAll = (v: boolean) => {
    const pages = Object.fromEntries(ADMIN_PAGE_KEYS.map((k) => [k, v])) as AdminPermissions['pages'];
    pages.dashboard = true; // always on
    onChange({ pages });
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setAll(true)}
          disabled={disabled}
          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-50"
        >
          Select all
        </button>
        <button
          type="button"
          onClick={() => setAll(false)}
          disabled={disabled}
          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 rounded disabled:opacity-50"
        >
          Clear (dashboard only)
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ADMIN_PAGE_KEYS.map((key) => (
          <label
            key={key}
            className={`flex items-center gap-3 p-3 rounded-lg border ${
              value.pages[key]
                ? 'border-indigo-300 bg-indigo-50'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            } ${disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'} ${
              key === 'dashboard' ? 'opacity-80' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={value.pages[key]}
              disabled={disabled || key === 'dashboard'}
              onChange={() => toggle(key)}
              className="w-4 h-4 accent-indigo-600"
            />
            <span className="text-sm font-medium text-slate-700">
              {ADMIN_PAGE_LABELS[key]}
              {key === 'dashboard' && (
                <span className="ml-1 text-[10px] uppercase tracking-wider text-slate-400">always on</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add Admin modal (two tabs: Invite / Promote)
// ---------------------------------------------------------------------------

interface InviteCredentials {
  email: string;
  tempPassword: string;
  loginUrl: string;
}

function CopyableRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard denied — user can still manually copy */ }
  };
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <code className="text-sm text-slate-800 font-mono break-all flex-1 select-all">{value}</code>
        <button
          onClick={doCopy}
          className="flex-shrink-0 p-1.5 hover:bg-white rounded text-slate-600"
          title="Copy"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function CredentialsPanel({ creds, onClose }: { creds: InviteCredentials; onClose: () => void }) {
  const summary = `Login URL: ${creds.loginUrl}\nEmail: ${creds.email}\nTemp password: ${creds.tempPassword}\n\nPlease sign in and change your password via your profile after first login.`;
  const [copiedAll, setCopiedAll] = useState(false);
  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(summary);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    } catch { /* silent */ }
  };
  return (
    <div className="space-y-4">
      <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex gap-3">
        <Check className="w-5 h-5 text-emerald-700 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-emerald-900">
          <div className="font-semibold">Admin created successfully.</div>
          <div className="mt-1">
            Copy the credentials below and share them with the new admin out-of-band
            (Slack DM, personal email, etc.). <strong>This temporary password will not be shown again.</strong>
          </div>
        </div>
      </div>

      <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
        <CopyableRow label="Login URL" value={creds.loginUrl} />
        <CopyableRow label="Email" value={creds.email} />
        <CopyableRow label="Temporary password" value={creds.tempPassword} />
      </div>

      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>
          After signing in, the new admin should change their password. If they forget it later,
          a super admin can demote + re-invite them (a fresh temp password will be generated).
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={copyAll}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
        >
          {copiedAll ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          {copiedAll ? 'Copied' : 'Copy all'}
        </button>
        <button
          onClick={onClose}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function AddAdminModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const { showNotification } = useNotifications();
  const [tab, setTab] = useState<'invite' | 'promote'>('invite');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [permissions, setPermissions] = useState<AdminPermissions>(DEFAULT_ADMIN_PERMISSIONS);
  const [submitting, setSubmitting] = useState(false);
  const [lookupResult, setLookupResult] = useState<Profile | null | 'not_found' | 'searching'>(null);
  // When non-null, show the credentials-reveal panel instead of the invite form.
  // The modal stays open until the super admin dismisses it — they MUST
  // capture the temp password before closing.
  const [credentials, setCredentials] = useState<InviteCredentials | null>(null);

  const doLookup = async () => {
    setLookupResult('searching');
    const p = await findProfileByEmail(email);
    setLookupResult(p ?? 'not_found');
  };

  const submitInvite = async () => {
    setSubmitting(true);
    const res = await inviteAdmin({ email, fullName, permissions });
    setSubmitting(false);
    if (!res.success) {
      if (res.alreadyExists) {
        showNotification(res.error || 'User exists. Switch to "Promote".', 'error');
        setTab('promote');
        doLookup();
      } else {
        showNotification(res.error || 'Invite failed', 'error');
      }
      return;
    }
    if (!res.tempPassword || !res.email || !res.loginUrl) {
      showNotification('Admin created but credentials missing from response', 'error');
      onDone();
      return;
    }
    setCredentials({ email: res.email, tempPassword: res.tempPassword, loginUrl: res.loginUrl });
  };

  const closeAfterCreds = () => {
    setCredentials(null);
    onDone();
  };

  const submitPromote = async () => {
    if (!(lookupResult && lookupResult !== 'not_found' && lookupResult !== 'searching')) return;
    setSubmitting(true);
    const updated = await promoteToAdmin(lookupResult.id, permissions);
    setSubmitting(false);
    if (!updated) {
      showNotification('Promote failed — RLS may have rejected it', 'error');
      return;
    }
    showNotification(`${lookupResult.email} promoted to admin`, 'success');
    onDone();
  };

  if (credentials) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between p-5 border-b">
            <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Key className="w-5 h-5 text-amber-600" />
              Admin credentials
            </h3>
            {/* No X close here — force the super admin to go through the
                "Done" button so they don't lose the temp password by
                accident. */}
          </div>
          <div className="p-5">
            <CredentialsPanel creds={credentials} onClose={closeAfterCreds} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Add Admin
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-b">
          <nav className="flex">
            <button
              onClick={() => setTab('invite')}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === 'invite'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Invite new user
            </button>
            <button
              onClick={() => setTab('promote')}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
                tab === 'promote'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Promote existing user
            </button>
          </nav>
        </div>

        <div className="p-5 space-y-5">
          {tab === 'invite' ? (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Full name (optional)</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Page access</label>
                <PermissionsGrid value={permissions} onChange={setPermissions} />
              </div>
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg flex gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-500" />
                <span>
                  <strong>How this works:</strong> we'll create the admin account with a
                  random temporary password and show you the credentials on the next screen.
                  Share them with the new admin (Slack DM, email from your own provider, etc.).
                  They'll sign in at the login page and can change their password after.
                  <br />
                  <span className="text-slate-500">No email is sent from the system.</span>
                </span>
              </div>
              <button
                onClick={submitInvite}
                disabled={!email || submitting}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                Create admin account
              </button>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setLookupResult(null); }}
                    placeholder="user@example.com"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    onClick={doLookup}
                    disabled={!email || lookupResult === 'searching'}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg flex items-center gap-2 text-sm"
                  >
                    {lookupResult === 'searching' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Find
                  </button>
                </div>
              </div>

              {lookupResult === 'not_found' && (
                <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg flex gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>No user found with that email. Switch to the "Invite" tab to send them an invitation.</span>
                </div>
              )}

              {lookupResult && lookupResult !== 'searching' && lookupResult !== 'not_found' && (
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <div className="font-semibold text-slate-800">{lookupResult.fullName || '(no name)'}</div>
                    <div className="text-sm text-slate-600">{lookupResult.email}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      Current role: <span className="font-mono">{lookupResult.role}</span>
                    </div>
                  </div>
                  {(lookupResult.role === 'admin' || lookupResult.role === 'super_admin') && (
                    <div className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg flex gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>This user is already an admin. Use "Edit permissions" on their row instead.</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Page access</label>
                    <PermissionsGrid value={permissions} onChange={setPermissions} />
                  </div>
                  <button
                    onClick={submitPromote}
                    disabled={submitting || lookupResult.role === 'admin' || lookupResult.role === 'super_admin'}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    Promote to admin
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit permissions modal
// ---------------------------------------------------------------------------

function EditPermissionsModal({
  profile,
  onClose,
  onDone,
}: {
  profile: Profile;
  onClose: () => void;
  onDone: () => void;
}) {
  const { showNotification } = useNotifications();
  const [permissions, setPermissions] = useState<AdminPermissions>(
    profile.adminPermissions ?? FALLBACK_ADMIN_PERMISSIONS,
  );
  const [submitting, setSubmitting] = useState(false);

  const save = async () => {
    setSubmitting(true);
    const updated = await updateAdminPermissions(profile.id, permissions);
    setSubmitting(false);
    if (!updated) {
      showNotification('Update failed', 'error');
      return;
    }
    showNotification('Permissions updated', 'success');
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-bold text-slate-800">Edit permissions</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-3">
            <div className="font-semibold text-slate-800">{profile.fullName || '(no name)'}</div>
            <div className="text-sm text-slate-600">{profile.email}</div>
          </div>
          <PermissionsGrid value={permissions} onChange={setPermissions} />
          <button
            onClick={save}
            disabled={submitting}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold rounded-lg flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save permissions
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminsManagement() {
  const { profile: me } = useAuth();
  const { showNotification } = useNotifications();
  const [admins, setAdmins] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [demoting, setDemoting] = useState<Profile | null>(null);

  const refresh = async () => {
    setLoading(true);
    setAdmins(await listAdminProfiles());
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleDemote = async () => {
    if (!demoting) return;
    const res = await demoteAdmin(demoting.id);
    if (!res) {
      showNotification('Demote failed', 'error');
      return;
    }
    showNotification(`${demoting.email} demoted`, 'success');
    setDemoting(null);
    refresh();
  };

  const summarisePages = (p: Profile): string => {
    if (p.role === 'super_admin') return 'All pages';
    const perms = p.adminPermissions?.pages;
    if (!perms) return 'Dashboard only';
    const active = ADMIN_PAGE_KEYS.filter((k) => perms[k]);
    if (active.length === ADMIN_PAGE_KEYS.length) return 'All pages';
    return active.map((k) => ADMIN_PAGE_LABELS[k].split(' (')[0]).join(', ');
  };

  return (
    <>
      <header className="mb-8 flex justify-between items-start bg-gradient-to-r from-slate-700 to-slate-900 p-8 rounded-3xl shadow-2xl shadow-slate-900/20 text-white relative overflow-hidden border border-slate-700">
        <div className="relative z-10">
          <div className="inline-block bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase mb-3 border border-white/20">
            ADMIN MANAGEMENT
          </div>
          <h2 className="text-4xl font-extrabold tracking-tight mb-2">Admins & Permissions</h2>
          <p className="text-slate-200 text-lg max-w-lg">
            Invite new admins, promote existing users, and control which dashboard pages each admin can access.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="bg-white text-slate-900 px-5 py-3 rounded-xl font-bold shadow-lg hover:bg-slate-100 flex items-center gap-2 relative z-10"
        >
          <UserPlus className="w-4 h-4" />
          Add Admin
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      ) : (
        <div className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl border border-white/60 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">User</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Role</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Access</th>
                <th className="text-right px-6 py-3 text-xs font-bold text-slate-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {admins.map((a) => {
                const isMe = a.id === me?.id;
                const isSuper = a.role === 'super_admin';
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-800">{a.fullName || '(no name)'}</div>
                      <div className="text-sm text-slate-500">{a.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-full ${
                          isSuper
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {isSuper ? 'Super Admin' : 'Admin'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{summarisePages(a)}</td>
                    <td className="px-6 py-4 text-right">
                      {isSuper ? (
                        <span className="text-xs text-slate-400 italic">Full access</span>
                      ) : (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditing(a)}
                            className="px-3 py-1.5 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 rounded"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDemoting(a)}
                            disabled={isMe}
                            title={isMe ? "You can't demote yourself" : undefined}
                            className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 rounded disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Demote
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-20 text-center text-slate-500">
                    No admins yet. Click "Add Admin" to invite or promote a user.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!isSuperAdmin(me) && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>You are not a super_admin — you shouldn't be seeing this page. Contact a super_admin.</span>
        </div>
      )}

      {showAdd && <AddAdminModal onClose={() => setShowAdd(false)} onDone={() => { setShowAdd(false); refresh(); }} />}
      {editing && <EditPermissionsModal profile={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); refresh(); }} />}
      {demoting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-slate-800 mb-3 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              Demote admin?
            </h3>
            <p className="text-sm text-slate-600 mb-5">
              <span className="font-semibold">{demoting.email}</span> will lose admin access and be
              reverted to an attendee account. Their user account stays intact. You can promote them
              again later.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDemoting(null)} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded">
                Cancel
              </button>
              <button onClick={handleDemote} className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                Demote
              </button>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-slate-400 text-center">
        Note: super admins always have full access. Page permissions only apply to non-super admins.
      </p>
    </>
  );
}
