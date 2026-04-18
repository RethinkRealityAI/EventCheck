import { useEffect, useState } from 'react';
import { listActiveAnnouncements } from '../../../services/announcementService';
import { CURRENT_SITE } from '../../../config/sites';
import type { Announcement } from '../../../types';
import { GlassCard } from '../ui/GlassCard';

export function AnnouncementsFeed() {
  const site = CURRENT_SITE.key;
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    listActiveAnnouncements(site, 3).then(setItems);
  }, [site]);

  return (
    <section>
      <h2 className="font-display text-2xl font-semibold mb-4">Announcements</h2>
      {items.length === 0 && (
        <GlassCard>
          <p className="font-body text-gansid-on-surface/60">No announcements yet. Check back soon.</p>
        </GlassCard>
      )}
      <div className="space-y-4">
        {items.map((a) => (
          <GlassCard key={a.id}>
            {a.imageUrl && <img src={a.imageUrl} alt="" className="w-full rounded-gansid-md object-cover max-h-64 mb-4" />}
            <h3 className="font-display text-lg font-semibold">{a.title}</h3>
            <div className="font-body text-sm text-gansid-on-surface/50 mb-2">{new Date(a.publishedAt).toLocaleDateString()}</div>
            {a.body && <p className="font-body whitespace-pre-wrap">{a.body}</p>}
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
