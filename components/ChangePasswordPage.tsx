// components/ChangePasswordPage.tsx
//
// Standalone page wrapper at /#/change-password. Used primarily by SCAGO
// admins (no portal surface) but available to any signed-in user.

import { ChangePasswordForm } from './ChangePasswordForm';
import { useAuth } from './AuthContext';
import { KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CURRENT_SITE } from '../config/sites';
import { hasAdminAccess } from '../utils/adminPermissions';

export default function ChangePasswordPage() {
  const { profile } = useAuth();
  // Pick a sensible "back" destination based on where the user likely came from.
  const backHref = hasAdminAccess(profile)
    ? '/admin'
    : CURRENT_SITE.portalEnabled
      ? '/portal'
      : '/';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-5 text-white flex items-center gap-3">
            <div className="p-2 bg-white/10 rounded-lg">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Change Password</h1>
              <p className="text-xs text-slate-300">Update your sign-in password</p>
            </div>
          </div>
          <div className="p-6">
            <ChangePasswordForm theme="admin" />
          </div>
        </div>
        <div className="mt-4 text-center">
          <Link to={backHref} className="text-sm text-slate-500 hover:text-slate-700">
            &larr; Back
          </Link>
        </div>
      </div>
    </div>
  );
}
