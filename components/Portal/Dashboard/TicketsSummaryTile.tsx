import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Attendee, Form } from '../../../types';
import { getAttendeesForUserWithBogoClaims, getFormById } from '../../../services/storageService';
import { countAvailableBogoSlots, isBogoEligibleSource } from '../../../utils/bogo';
import { useAuth } from '../../AuthContext';

/** Small portal-dashboard tile summarising the user's tickets:
 *  - count of active (non-test) paid registrations they hold
 *  - count of BOGO free-guest slots they can still send
 *
 * Renders nothing while loading or when the user has no tickets at all,
 * so the dashboard stays uncluttered for brand-new portal users. */
export function TicketsSummaryTile() {
  const { user, profile } = useAuth();
  const [activeCount, setActiveCount] = useState<number>(0);
  const [freeCount, setFreeCount] = useState<number>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const all = await getAttendeesForUserWithBogoClaims(
          user.id,
          profile?.email ?? user.email ?? '',
        );
        if (cancelled) return;

        const myPaid = all.filter(a => a.isBogoClaim !== true && a.isTest !== true);
        // Active = paid (or pending/external) registrations — exclude cancelled-style states.
        const active = myPaid.filter(a => {
          const s = (a.paymentStatus || '').toLowerCase();
          return s === 'paid' || s === 'pending' || s === '' || s === 'free';
        });

        const formIds = Array.from(new Set(myPaid.map(a => a.formId)));
        const forms = await Promise.all(formIds.map(id => getFormById(id).catch(() => null)));
        const formsById: Record<string, Form> = {};
        for (const f of forms) if (f) formsById[f.id] = f;

        const eligibleMine = myPaid.filter(a => {
          const f = formsById[a.formId];
          return f && isBogoEligibleSource(a, f);
        });
        const slots = countAvailableBogoSlots(eligibleMine, all, formsById);

        if (!cancelled) {
          setActiveCount(active.length);
          setFreeCount(slots);
          setReady(true);
        }
      } catch (e) {
        console.warn('TicketsSummaryTile fetch failed', e);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, user?.email, profile?.email]);

  if (!ready || activeCount === 0) return null;

  return (
    <Link
      to="/portal/tickets"
      className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-emerald-300 transition"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>🎟</span>
        <div className="flex-1">
          <h3 className="font-semibold text-slate-900">Your tickets</h3>
          <p className="text-sm text-slate-600 mt-0.5">
            {activeCount} active registration{activeCount === 1 ? '' : 's'}
          </p>
          {freeCount > 0 && (
            <p className="text-sm text-emerald-700 font-medium mt-0.5">
              🎁 {freeCount} free ticket{freeCount === 1 ? '' : 's'} to send
            </p>
          )}
          <p className="text-xs text-emerald-700 mt-2 underline">View all →</p>
        </div>
      </div>
    </Link>
  );
}
