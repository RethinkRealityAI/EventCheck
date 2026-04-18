import type { Form, Attendee, Profile } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';
import { Link } from 'react-router-dom';

interface Props {
  forms: Form[];
  userAttendees: Attendee[];
  role: Profile['role'];
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

export function AvailableFormsGrid({ forms, userAttendees, role }: Props) {
  const allowedTypes = ROLE_TO_FORM_TYPES[role] ?? ['event'];
  const visible = forms.filter((f) => allowedTypes.includes(f.formType ?? 'event'));

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Available Forms</h2>
      {visible.length === 0 && (
        <GlassCard>
          <p className="font-body text-gansid-on-surface/60">No forms available for your account type yet.</p>
        </GlassCard>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.map((form) => {
          const registered = userAttendees.some((a) => (a as any).formId === form.id);
          return (
            <GlassCard key={form.id}>
              <h3 className="font-display text-lg font-semibold">{form.title}</h3>
              <p className="font-body text-gansid-on-surface/70 text-sm mt-1 mb-4">{form.description ?? ''}</p>
              <Link to={`/form/${form.id}`}>
                <ViscousButton variant={registered ? 'secondary' : 'primary'}>
                  {registered ? 'View Registration' : 'Start Registration'}
                </ViscousButton>
              </Link>
            </GlassCard>
          );
        })}
      </div>
    </section>
  );
}
