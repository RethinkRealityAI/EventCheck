import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ticket, Gift, ArrowRight } from 'lucide-react';
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
      aria-label={`Your tickets — ${activeCount} active registration${activeCount === 1 ? '' : 's'}${freeCount > 0 ? `, ${freeCount} free to send` : ''}`}
      className="group relative block overflow-hidden rounded-2xl bg-[linear-gradient(140deg,#2260a1_0%,#1a4880_55%,#8b2a5e_130%)] p-5 text-white shadow-[0_16px_36px_-16px_rgba(34,96,161,0.7)] ring-1 ring-white/10 transition-transform duration-300 ease-viscous hover:-translate-y-0.5"
    >
      {/* interior sheen + subtle motif */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent" aria-hidden />
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl" aria-hidden />

      <div className="relative flex items-start gap-3.5">
        <span
          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm"
          aria-hidden
        >
          <Ticket className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold tracking-tight">Your tickets</h3>
            <ArrowRight className="h-4 w-4 opacity-80 transition-transform duration-300 ease-viscous group-hover:translate-x-1" />
          </div>
          <p className="mt-0.5 font-body text-sm text-white/85">
            <span className="font-display text-lg font-bold">{activeCount}</span>{' '}
            active registration{activeCount === 1 ? '' : 's'}
          </p>
          {freeCount > 0 && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 font-display text-xs font-bold text-gansid-primary shadow-sm">
              <Gift className="h-3.5 w-3.5" />
              {freeCount} free ticket{freeCount === 1 ? '' : 's'} to send
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
