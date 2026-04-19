import { useEffect, useState } from 'react';
import type { Form, Attendee, Profile } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';
import { readSavedProgress, clearSavedProgress, type SavedProgress } from '../../../utils/registrationProgress';
import { listDraftSummaries, clearDraft } from '../../../services/registrationDraftService';

interface Props {
  forms: Form[];
  userAttendees: Attendee[];
  role: Profile['role'];
  userId: string | null;
  /** `fresh=true` signals the caller should wipe any saved localStorage progress before opening the form. */
  onStartRegistration: (formId: string, opts: { fresh: boolean }) => void;
}

// Map profile role → which form_type values the user should see.
// Admins see every form; otherwise users only see forms that match
// their chosen registration track.
const ROLE_TO_FORM_TYPES: Record<Profile['role'], string[]> = {
  attendee: ['event'],
  exhibitor: ['exhibitor'],
  sponsor: ['sponsor'],
  admin: ['event', 'exhibitor', 'sponsor'],
};

// Completed = user already has a confirmed (paid or free) submission for this form.
// Pending/cheque/placeholder rows do NOT count as completed.
const COMPLETED_STATUSES = new Set(['paid', 'free']);

function formatAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export function AvailableFormsGrid({ forms, userAttendees, role, userId, onStartRegistration }: Props) {
  const allowedTypes = ROLE_TO_FORM_TYPES[role] ?? ['event'];
  const completedFormIds = new Set(
    userAttendees
      .filter((a) => COMPLETED_STATUSES.has((a as any).paymentStatus))
      .map((a) => (a as any).formId),
  );
  const visible = forms
    .filter((f) => allowedTypes.includes(f.formType ?? 'event'))
    .filter((f) => !completedFormIds.has(f.id));

  // Read saved-progress state per form. Merges localStorage (per-browser) with
  // DB drafts (cross-device) — whichever is newer wins for the indicator.
  // Re-check whenever the visible list changes (e.g. after a registration completes).
  const [savedByForm, setSavedByForm] = useState<Record<string, SavedProgress | null>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local: Record<string, SavedProgress | null> = {};
      for (const f of visible) local[f.id] = readSavedProgress(f.id, userId);

      let remote: Record<string, { currentIndex: number; savedAt: number }> = {};
      if (userId) {
        try { remote = await listDraftSummaries(); } catch {/* ignore */}
      }
      if (cancelled) return;

      const merged: Record<string, SavedProgress | null> = {};
      for (const f of visible) {
        const l = local[f.id];
        const r = remote[f.id];
        if (l && r) {
          merged[f.id] = (r.savedAt ?? 0) > (l.savedAt ?? 0)
            ? { currentIndex: r.currentIndex, totalSteps: 0, savedAt: r.savedAt }
            : l;
        } else if (r) {
          merged[f.id] = { currentIndex: r.currentIndex, totalSteps: 0, savedAt: r.savedAt };
        } else {
          merged[f.id] = l;
        }
      }
      setSavedByForm(merged);
    })();
    return () => { cancelled = true; };
  }, [visible.map((f) => f.id).join('|'), userId]);

  const handleStartOver = (formId: string) => {
    clearSavedProgress(formId, userId);
    if (userId) clearDraft(formId).catch(() => {});
    setSavedByForm((prev) => ({ ...prev, [formId]: null }));
    onStartRegistration(formId, { fresh: true });
  };

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Available Forms</h2>
      {visible.length === 0 && (
        <GlassCard>
          <p className="font-body text-gansid-on-surface/60">
            {completedFormIds.size > 0
              ? "You're all registered — nothing left on your list."
              : 'No forms available for your account type yet.'}
          </p>
        </GlassCard>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((form) => {
          const saved = savedByForm[form.id] ?? null;
          const stepCount = form.settings?.steps?.length ?? 0;
          return (
            <GlassCard key={form.id}>
              <h3 className="font-display text-lg font-semibold">{form.title}</h3>
              <p className="font-body text-gansid-on-surface/70 text-sm mt-1 mb-4">{form.description ?? ''}</p>
              {saved ? (
                <div className="space-y-2">
                  <div className="rounded-xl bg-gansid-secondary/10 border border-gansid-secondary/20 px-3 py-2">
                    <p className="text-xs font-body text-gansid-on-surface/80">
                      <span className="font-display font-bold text-gansid-secondary">Progress saved</span>
                      {stepCount > 0
                        ? ` — you're on step ${Math.min(saved.currentIndex + 1, stepCount)} of ${stepCount}.`
                        : '.'}
                      {saved.savedAt ? ` Last saved ${formatAgo(saved.savedAt)}.` : ''}
                    </p>
                  </div>
                  <ViscousButton variant="primary" onClick={() => onStartRegistration(form.id, { fresh: false })}>
                    Resume Registration
                  </ViscousButton>
                  <button
                    type="button"
                    onClick={() => handleStartOver(form.id)}
                    className="block text-xs font-body text-gansid-on-surface/60 hover:text-gansid-primary underline transition"
                  >
                    Or start over
                  </button>
                </div>
              ) : (
                <ViscousButton variant="primary" onClick={() => onStartRegistration(form.id, { fresh: false })}>
                  Start Registration
                </ViscousButton>
              )}
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
