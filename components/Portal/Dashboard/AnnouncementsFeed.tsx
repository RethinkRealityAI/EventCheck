import { GlassCard } from '../ui/GlassCard';

export function AnnouncementsFeed() {
  // Real implementation in Task 27
  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Announcements</h2>
      <GlassCard>
        <p className="font-body text-gansid-on-surface/60">No announcements yet. Check back soon.</p>
      </GlassCard>
    </section>
  );
}
