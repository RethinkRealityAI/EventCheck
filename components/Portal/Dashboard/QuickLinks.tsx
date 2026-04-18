import { GlassCard } from '../ui/GlassCard';

const LINKS = [
  { label: 'Full Itinerary', icon: '📅' },
  { label: 'Congress Materials', icon: '📁' },
  { label: 'Venue Info', icon: '📍' },
];

export function QuickLinks() {
  return (
    <section>
      <h3 className="font-display text-xs uppercase tracking-wide text-gansid-on-surface/40 mb-3">Quick Links</h3>
      <div className="space-y-2">
        {LINKS.map((link) => (
          <GlassCard key={link.label} className="flex items-center gap-3 cursor-default">
            <span className="opacity-50">{link.icon}</span>
            <span className="font-body text-gansid-on-surface/60">{link.label}</span>
            <span className="ml-auto text-xs text-gansid-on-surface/40">Coming soon</span>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
