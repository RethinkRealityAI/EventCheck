import { GlassCard } from '../ui/GlassCard';
import { ExternalLink } from 'lucide-react';

const SOON_LINKS = [
  { label: 'Full Itinerary', icon: '📅' },
  { label: 'Congress Materials', icon: '📁' },
  { label: 'Venue Info', icon: '📍' },
];

const EXTERNAL_LINKS = [
  {
    label: 'Congress Home',
    icon: '🌐',
    href: 'https://inheritedblooddisorders.world/congress-2026/',
    description: 'Return to the main Congress page',
  },
];

export function QuickLinks() {
  return (
    <section>
      <h3 className="font-display text-xs uppercase tracking-wide text-gansid-on-surface/40 mb-3">Quick Links</h3>
      <div className="space-y-2">
        {EXTERNAL_LINKS.map((link) => (
          <a
            key={link.label}
            href={link.href}
            target="_top"
            rel="noopener noreferrer"
            className="block"
          >
            <GlassCard className="flex items-center gap-3 hover:bg-gansid-primary-container/5 transition cursor-pointer">
              <span>{link.icon}</span>
              <div className="flex flex-col min-w-0">
                <span className="font-body text-gansid-on-surface">{link.label}</span>
                <span className="text-xs text-gansid-on-surface/50 truncate">{link.description}</span>
              </div>
              <ExternalLink className="ml-auto w-4 h-4 text-gansid-on-surface/40 flex-shrink-0" />
            </GlassCard>
          </a>
        ))}
        {SOON_LINKS.map((link) => (
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
