import React, { useEffect, useState, useCallback } from 'react';
import QRCode from 'react-qr-code';
import type { Attendee, Form, PricingTemplate } from '../../../types';
import { getAttendeesForUserWithBogoClaims, getFormById } from '../../../services/storageService';
import { useAuth } from '../../AuthContext';
import { useNotifications } from '../../NotificationSystem';
import { supabase } from '../../../services/supabaseClient';
import {
  BOGO_ADMIN_CONTACT,
  getBogoSlotState,
  getEligibleBogoCategories,
  isBogoEligibleSource,
  type BogoSlotState,
} from '../../../utils/bogo';

// Light data structure: one card per the user's paid attendee row, plus the
// form and pricing template attached for ceiling lookups.
interface PaidCard {
  paid: Attendee;
  form: Form;
  pricingTemplate?: PricingTemplate | null;
  state: BogoSlotState;
}

export default function MyTicketsPage() {
  const { user, profile } = useAuth();
  const { showNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<PaidCard[]>([]);
  const [dismissed, setDismissed] = useState<Attendee[]>([]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const all = await getAttendeesForUserWithBogoClaims(user.id, profile?.email ?? user.email ?? '');
      const formIds = Array.from(new Set(all.map(a => a.formId)));
      const forms = await Promise.all(formIds.map(id => getFormById(id).catch(() => null)));
      const formsById: Record<string, Form> = {};
      for (const f of forms) if (f) formsById[f.id] = f;

      // Mine = paid attendee rows tied to my user_id (or matched-by-email).
      // Exclude BOGO claim rows (those are listed under their source's card).
      const mine = all.filter(a => a.isBogoClaim !== true);
      const built: PaidCard[] = [];
      for (const paid of mine) {
        const form = formsById[paid.formId];
        if (!form) continue;
        if (!isBogoEligibleSource(paid, form)) {
          // Still surface the ticket card — just with no BOGO subpanel.
          built.push({ paid, form, pricingTemplate: form.pricingTemplate ?? null, state: { kind: 'ineligible' } });
          continue;
        }
        const state = getBogoSlotState(paid, all, form);
        built.push({ paid, form, pricingTemplate: form.pricingTemplate ?? null, state });
      }
      setCards(built);

      // Track dismissed claim rows separately so we can render a
      // "Show hidden" link when there are any.
      const dis = all.filter(a => a.isBogoClaim && a.bogoDismissedByPayerAt);
      setDismissed(dis);
    } catch (e) {
      console.error('MyTicketsPage refresh failed', e);
      showNotification('Failed to load your tickets', 'error');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email, profile?.email, showNotification]);

  useEffect(() => { refresh(); }, [refresh]);

  const callBogoSend = useCallback(async (action: string, payload: Record<string, any>): Promise<boolean> => {
    setPendingAction(action);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('bogo-send', {
        body: { action, ...payload },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      });
      if (error) {
        // supabase-js v2 sets data=null on non-2xx; the structured error body
        // lives in error.context (the raw Response). Try to extract it first.
        let errCode: string = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) errCode = body.error;
        } catch { /* ignore parse failures */ }
        console.error('bogo-send error:', errCode);
        showNotification(prettyBogoError(errCode), 'error');
        return false;
      }
      return true;
    } catch (e: any) {
      console.error('bogo-send caught:', e);
      showNotification('Something went wrong. Please try again.', 'error');
      return false;
    } finally {
      setPendingAction(null);
    }
  }, [showNotification]);

  const availableCount = cards.filter(c => c.state.kind === 'available').length;

  if (loading) {
    return <p className="text-sm text-slate-600">Loading your tickets…</p>;
  }
  if (cards.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-600">You haven't registered for any events yet.</p>
        <a href="#/portal" className="inline-block mt-4 px-4 py-2 bg-emerald-600 text-white rounded-lg">
          Browse available forms
        </a>
      </div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Your Tickets</h1>
        {availableCount > 0 && (
          <p className="text-sm text-emerald-700 mt-1">
            🎁 You have <strong>{availableCount}</strong> free guest ticket{availableCount === 1 ? '' : 's'} to send.
          </p>
        )}
      </header>

      <div className="space-y-4">
        {cards.map(card => (
          <TicketCard
            key={card.paid.id}
            card={card}
            pendingAction={pendingAction}
            onAction={callBogoSend}
            onAfterAction={refresh}
          />
        ))}
      </div>

      {dismissed.length > 0 && (
        <div className="mt-8 pt-6 border-t border-slate-200">
          <button
            type="button"
            onClick={() => setShowDismissed(v => !v)}
            className="text-sm text-slate-600 hover:text-slate-900 underline"
          >
            {showDismissed ? 'Hide' : 'Show'} hidden free guests ({dismissed.length})
          </button>
          {showDismissed && (
            <div className="mt-4 space-y-2">
              {dismissed.map(free => (
                <DismissedRow
                  key={free.id}
                  free={free}
                  pending={pendingAction === 'restore'}
                  onRestore={async () => {
                    const ok = await callBogoSend('restore', { freeAttendeeId: free.id });
                    if (ok) {
                      showNotification('Restored to your tickets page', 'success');
                      refresh();
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── TicketCard ──────────────────────────────────────────────────────
function TicketCard({ card, pendingAction, onAction, onAfterAction }: {
  card: PaidCard;
  pendingAction: string | null;
  onAction: (action: string, payload: Record<string, any>) => Promise<boolean>;
  onAfterAction: () => void;
}) {
  const { paid, form, pricingTemplate, state } = card;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-shrink-0">
          {paid.qrPayload && (
            <div className="p-2 bg-white border border-slate-200 rounded-lg">
              <QRCode value={paid.qrPayload} size={140} />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-semibold text-slate-900">{form.title}</h2>
          <p className="text-sm text-slate-600">{paid.ticketType}</p>
          <dl className="mt-2 text-xs text-slate-500 space-y-0.5">
            <div>Registered: {new Date(paid.registeredAt).toLocaleDateString()}</div>
            <div>
              Status: {paid.checkedInAt
                ? <span className="text-emerald-700 font-medium">Checked in ✓</span>
                : 'Not yet checked in'}
            </div>
          </dl>
        </div>
      </div>

      {state.kind !== 'ineligible' && (
        <div className="mt-5 pt-4 border-t border-slate-200">
          <BogoSlotPanel
            card={card}
            state={state}
            pricingTemplate={pricingTemplate}
            pendingAction={pendingAction}
            onAction={onAction}
            onAfterAction={onAfterAction}
          />
        </div>
      )}
    </div>
  );
}

// ── BogoSlotPanel ───────────────────────────────────────────────────
function BogoSlotPanel({ card, state, pricingTemplate, pendingAction, onAction, onAfterAction }: {
  card: PaidCard;
  state: BogoSlotState;
  pricingTemplate?: PricingTemplate | null;
  pendingAction: string | null;
  onAction: (action: string, payload: Record<string, any>) => Promise<boolean>;
  onAfterAction: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'send' | 'edit'>('idle');
  const isBusy = pendingAction !== null;

  if (state.kind === 'available') {
    if (mode === 'send') {
      return (
        <BogoSendForm
          card={card}
          pricingTemplate={pricingTemplate}
          busy={isBusy}
          onCancel={() => setMode('idle')}
          onSubmit={async (vals) => {
            const ok = await onAction('send', {
              paidAttendeeId: card.paid.id,
              ...vals,
            });
            if (ok) { setMode('idle'); onAfterAction(); }
          }}
        />
      );
    }
    return (
      <div>
        <h3 className="text-sm font-semibold text-emerald-900 mb-1">🎁 Bring a free guest</h3>
        <p className="text-xs text-slate-600 mb-2">
          You have one free guest ticket available with this registration.
        </p>
        <button
          type="button"
          onClick={() => setMode('send')}
          className="px-3 py-1.5 bg-emerald-600 text-white text-sm rounded-lg hover:bg-emerald-700"
        >
          Send free ticket →
        </button>
      </div>
    );
  }

  if (state.kind === 'inline-sent' || state.kind === 'pending-claim-sent' || state.kind === 'claimed') {
    const free = (state as any).free as Attendee;
    const uncommitted = state.kind !== 'claimed' && (state as any).uncommitted;
    const isPending = state.kind === 'pending-claim-sent';

    if (mode === 'edit') {
      return (
        <BogoEditForm
          free={free}
          card={card}
          pricingTemplate={pricingTemplate}
          uncommitted={uncommitted}
          busy={isBusy}
          onCancel={() => setMode('idle')}
          onSubmit={async (vals) => {
            const action = uncommitted ? 'edit-recipient' : 'edit-name';
            const ok = await onAction(action, { freeAttendeeId: free.id, ...vals });
            if (ok) { setMode('idle'); onAfterAction(); }
          }}
        />
      );
    }

    return (
      <div>
        <h3 className="text-sm font-semibold text-emerald-900 mb-1">🎁 Free guest</h3>
        {state.kind === 'claimed' ? (
          <p className="text-sm text-slate-700">
            Claimed by <strong>{free.name}</strong> ({free.email})
          </p>
        ) : isPending ? (
          <p className="text-sm text-slate-700">
            Claim link sent to you — forward it to your guest:
            <button
              type="button"
              onClick={() => {
                const url = `${window.location.origin}/#/form/${free.formId}?ref=${free.id}`;
                navigator.clipboard?.writeText(url);
              }}
              className="ml-2 text-xs underline text-emerald-700"
            >
              Copy claim link
            </button>
          </p>
        ) : (
          <p className="text-sm text-slate-700">
            Sent to <strong>{free.name}</strong> ({free.email})
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          {state.kind !== 'claimed' && (
            <button
              type="button"
              disabled={isBusy}
              onClick={async () => {
                const ok = await onAction('resend', { freeAttendeeId: free.id });
                if (ok) onAfterAction();
              }}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            >
              {isPending ? 'Resend claim link' : 'Resend'}
            </button>
          )}
          {/* Edit guest details / Fix typo in name — only meaningful for
              inline-sent rows (claim_link has nothing recipient-side to edit
              until the guest claims). */}
          {(state.kind === 'inline-sent' || state.kind === 'claimed') && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => setMode('edit')}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
            >
              {uncommitted ? 'Edit guest details' : 'Fix typo in name'}
            </button>
          )}
          <button
            type="button"
            disabled={isBusy}
            onClick={async () => {
              if (!confirm('Hide this free guest from your tickets page?\n\nTheir ticket and profile (if any) will not be affected — only your view changes. You will not be able to send another free guest in their place.')) return;
              const ok = await onAction('dismiss', { freeAttendeeId: free.id });
              if (ok) onAfterAction();
            }}
            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300"
          >
            Hide from my tickets
          </button>
        </div>

        <p className="text-[11px] text-slate-500 mt-2 leading-snug">
          {isPending
            ? <>Your guest will set their own name, email, and category when they claim the link. After that, only name typos are editable.</>
            : uncommitted
              ? <>Editable until your guest signs up, claims, or checks in. After that only name typos can be fixed.</>
              : <>The recipient has acted on this ticket, so only the name is editable now.</>}
          {' '}For other changes contact{' '}
          <a href={`mailto:${BOGO_ADMIN_CONTACT}`} className="underline">{BOGO_ADMIN_CONTACT}</a>.
        </p>
      </div>
    );
  }

  return null;
}

// ── Send form ───────────────────────────────────────────────────────
function BogoSendForm({ card, pricingTemplate, busy, onCancel, onSubmit }: {
  card: PaidCard;
  pricingTemplate?: PricingTemplate | null;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (vals: { mode: 'inline' | 'claim_link'; guestName?: string; guestEmail?: string; categoryId?: string }) => void;
}) {
  const [mode, setMode] = useState<'inline' | 'claim_link'>('inline');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const eligibleCats = pricingTemplate
    ? getEligibleBogoCategories(pricingTemplate, {
        pricingCategoryId: card.paid.pricingCategoryId,
        pricingTier: card.paid.pricingTier,
        pricingBracket: card.paid.pricingBracket,
      })
    : [];

  const inlineReady = mode === 'inline'
    ? guestName.trim().length > 0 && /^.+@.+\..+$/.test(guestEmail) && !!categoryId
    : true;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="text-sm font-semibold text-emerald-900 mb-2">🎁 Send a free ticket</h3>
      <div className="flex flex-wrap gap-2 mb-3 text-xs">
        {(['inline', 'claim_link'] as const).map(m => (
          <label key={m} className={`px-3 py-1.5 rounded-full border cursor-pointer ${mode === m ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-800 border-emerald-300'}`}>
            <input type="radio" className="sr-only" checked={mode === m} onChange={() => setMode(m)} />
            {m === 'inline' ? 'Enter their info now' : 'Send me a claim link to forward'}
          </label>
        ))}
      </div>

      {mode === 'inline' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <input
            type="text" placeholder="Guest name" value={guestName}
            onChange={e => setGuestName(e.target.value)}
            className="px-3 py-2 border border-emerald-200 rounded-lg text-sm"
          />
          <input
            type="email" placeholder="Guest email" value={guestEmail}
            onChange={e => setGuestEmail(e.target.value)}
            className="px-3 py-2 border border-emerald-200 rounded-lg text-sm"
          />
          <select
            value={categoryId} onChange={e => setCategoryId(e.target.value)}
            disabled={eligibleCats.length === 0}
            className="px-3 py-2 border border-emerald-200 rounded-lg text-sm sm:col-span-2 disabled:bg-slate-100 disabled:text-slate-400"
          >
            <option value="">{eligibleCats.length === 0 ? 'No eligible categories' : 'Select category…'}</option>
            {eligibleCats.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {eligibleCats.length === 0 && (
            <p className="sm:col-span-2 text-[11px] text-amber-700 leading-snug">
              We couldn't load eligible ticket categories for your free guest right now. Try the
              "Send me a claim link to forward" option above, or contact{' '}
              <a className="underline" href={`mailto:${BOGO_ADMIN_CONTACT}`}>{BOGO_ADMIN_CONTACT}</a>.
            </p>
          )}
        </div>
      )}

      <p className="text-[11px] text-emerald-900/80 mb-3 leading-snug">
        ℹ Once you send a free ticket, the email cannot be changed after your guest signs up, claims, or
        checks in. Make sure it's the right email. Need an exception?{' '}
        <a className="underline" href={`mailto:${BOGO_ADMIN_CONTACT}`}>{BOGO_ADMIN_CONTACT}</a>.
      </p>

      <div className="flex gap-2 justify-end">
        <button
          type="button" onClick={onCancel} disabled={busy}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-slate-50"
        >Cancel</button>
        <button
          type="button"
          disabled={busy || !inlineReady}
          onClick={() => {
            const payload = mode === 'inline'
              ? { mode, guestName: guestName.trim(), guestEmail: guestEmail.trim(), categoryId }
              : { mode };
            if (mode === 'inline' && !confirm(`Send free ticket to ${guestEmail.trim()}?\n\nBy sending, you confirm this is the email of the guest attending. Their ticket will be locked to this address once they sign up, claim, or check in.`)) return;
            onSubmit(payload);
          }}
          className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >Send free ticket</button>
      </div>
    </div>
  );
}

// ── Edit form ───────────────────────────────────────────────────────
function BogoEditForm({ free, card, pricingTemplate, uncommitted, busy, onCancel, onSubmit }: {
  free: Attendee;
  card: PaidCard;
  pricingTemplate?: PricingTemplate | null;
  uncommitted: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (vals: { guestName?: string; guestEmail?: string; categoryId?: string }) => void;
}) {
  const [guestName, setGuestName] = useState(free.name);
  const [guestEmail, setGuestEmail] = useState(free.email);
  const [categoryId, setCategoryId] = useState(free.pricingCategoryId ?? '');
  const eligibleCats = pricingTemplate
    ? getEligibleBogoCategories(pricingTemplate, {
        pricingCategoryId: card.paid.pricingCategoryId,
        pricingTier: card.paid.pricingTier,
        pricingBracket: card.paid.pricingBracket,
      })
    : [];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">
        {uncommitted ? 'Edit guest details' : 'Fix typo in name'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        <input
          type="text" placeholder="Guest name" value={guestName}
          onChange={e => setGuestName(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
        />
        {uncommitted && (
          <>
            <input
              type="email" placeholder="Guest email" value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
            <select
              value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm sm:col-span-2"
            >
              <option value="">Select category…</option>
              {eligibleCats.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      <div className="flex gap-2 justify-end">
        <button
          type="button" onClick={onCancel} disabled={busy}
          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 hover:bg-white"
        >Cancel</button>
        <button
          type="button"
          disabled={busy || !guestName.trim()}
          onClick={() => {
            const payload: { guestName?: string; guestEmail?: string; categoryId?: string } = {
              guestName: guestName.trim(),
            };
            if (uncommitted) {
              payload.guestEmail = guestEmail.trim();
              payload.categoryId = categoryId;
            }
            onSubmit(payload);
          }}
          className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-900 disabled:opacity-50"
        >Save changes</button>
      </div>
    </div>
  );
}

function DismissedRow({ free, pending, onRestore }: { free: Attendee; pending: boolean; onRestore: () => void }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-slate-100/60 border border-slate-200 text-sm">
      <div className="text-slate-700">
        <strong>{free.name}</strong> · {free.email}
      </div>
      <button
        type="button" onClick={onRestore} disabled={pending}
        className="text-xs underline text-emerald-700 hover:text-emerald-900"
      >Restore</button>
    </div>
  );
}

function prettyBogoError(code: string): string {
  switch (code) {
    case 'BOGO_NOT_OWNER': return 'You don\'t own that ticket.';
    case 'BOGO_SLOT_TAKEN': return 'A free guest has already been sent for this ticket.';
    case 'BOGO_ALREADY_CHECKED_IN': return 'This action can\'t be done after check-in.';
    case 'BOGO_ALREADY_COMMITTED': return 'This recipient has signed up / claimed / checked in — only the name can be edited now.';
    case 'BOGO_PRICE_EXCEEDED': return 'Selected category exceeds your ticket\'s value.';
    case 'BOGO_MISSING_FIELDS': return 'Please fill in name, email, and category.';
    case 'BOGO_NO_TEMPLATE': return 'BOGO unavailable: this ticket has no pricing template.';
    default:
      return `Something went wrong. Please try again or contact ${BOGO_ADMIN_CONTACT}.`;
  }
}
