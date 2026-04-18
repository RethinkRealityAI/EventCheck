import type { Form, Attendee } from '../../../types';
import { GlassCard } from '../ui/GlassCard';
import { ViscousButton } from '../ui/ViscousButton';
import { Link } from 'react-router-dom';

interface Props {
  forms: Form[];
  userAttendees: Attendee[];
  roleOrder: 'attendee' | 'exhibitor' | 'sponsor';
}

export function AvailableFormsGrid({ forms, userAttendees, roleOrder }: Props) {
  const sorted = [...forms].sort((a, b) => {
    const aMatches = (a.formType ?? 'event') === roleOrder ? 1 : 0;
    const bMatches = (b.formType ?? 'event') === roleOrder ? 1 : 0;
    return bMatches - aMatches;
  });

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Available Forms</h2>
      {sorted.length === 0 && (
        <GlassCard>
          <p className="font-body text-gansid-on-surface/60">No forms available yet.</p>
        </GlassCard>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((form) => {
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
