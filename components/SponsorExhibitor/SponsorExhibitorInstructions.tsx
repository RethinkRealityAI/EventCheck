// GANSID brand colors live in index.css `@theme`: primary #ba0028 (red),
// secondary #2260a1 (blue). The three step cards use blue → purple → red so
// they trace the same arc as the page's gradient accents. Each card uses
// inline `style` so we don't need to add new utilities to index.css just for
// three one-off cards.
const STEPS = [
  {
    number: '01',
    title: 'Create your account',
    body: 'Sign up with your work email and pick whether you’re registering as a sponsor or an exhibitor. We’ll send a verification link to confirm your account.',
    gradient: 'linear-gradient(135deg, #2260a1 0%, #1E4A8C 100%)',
  },
  {
    number: '02',
    title: 'Complete the form',
    body: 'Confirm your contact details, select the sponsorship tier or booth type you purchased, and register the staff attending.',
    gradient: 'linear-gradient(135deg, #6b3a8c 0%, #4a2566 100%)',
  },
  {
    number: '03',
    title: 'Add extra staff (optional)',
    body: 'You can purchase additional staff spots beyond your package allotment.',
    gradient: 'linear-gradient(135deg, #ba0028 0%, #8a001f 100%)',
  },
];

export function SponsorExhibitorInstructions() {
  return (
    <div className="space-y-6">
      <header className="text-center max-w-2xl mx-auto space-y-2">
        <p className="text-xs font-display font-semibold uppercase tracking-[0.25em] text-gansid-secondary">
          What happens next
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold">
          A quick three-step registration
        </h2>
        <p className="font-body text-gansid-on-surface/70">
          Your tier or booth pricing is already invoiced separately. This form just collects who's
          attending so we can prepare badges, seating, and your booth assignment.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {STEPS.map((s) => (
          <div
            key={s.number}
            className="rounded-gansid-md p-5 shadow-lg text-white"
            style={{ backgroundImage: s.gradient }}
          >
            <div className="text-3xl font-display font-bold mb-2 text-white/90">{s.number}</div>
            <h3 className="font-display text-lg font-semibold mb-1">{s.title}</h3>
            <p className="font-body text-sm leading-snug text-white/90">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
