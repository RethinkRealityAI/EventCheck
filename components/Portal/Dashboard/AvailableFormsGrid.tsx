import type { Form, Attendee, Profile } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';

interface Props {
  forms: Form[];
  userAttendees: Attendee[];
  role: Profile['role'];
  onStartRegistration: (formId: string) => void;
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

export function AvailableFormsGrid({ forms, userAttendees, role, onStartRegistration }: Props) {
  const allowedTypes = ROLE_TO_FORM_TYPES[role] ?? ['event'];
  const completedFormIds = new Set(
    userAttendees
      .filter((a) => COMPLETED_STATUSES.has((a as any).paymentStatus))
      .map((a) => (a as any).formId),
  );
  const visible = forms
    .filter((f) => allowedTypes.includes(f.formType ?? 'event'))
    .filter((f) => !completedFormIds.has(f.id));

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
        {visible.map((form) => (
          <GlassCard key={form.id}>
            <h3 className="font-display text-lg font-semibold">{form.title}</h3>
            <p className="font-body text-gansid-on-surface/70 text-sm mt-1 mb-4">{form.description ?? ''}</p>
            <ViscousButton variant="primary" onClick={() => onStartRegistration(form.id)}>
              Start Registration
            </ViscousButton>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
