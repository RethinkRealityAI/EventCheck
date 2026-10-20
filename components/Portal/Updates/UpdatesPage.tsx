import { useEffect } from 'react';
import { AnnouncementsFeed } from '../Dashboard/AnnouncementsFeed';
import { useUpdates } from './useUpdates';

/** Every active announcement. Opening this screen marks them all as read. */
export function UpdatesPage() {
  const { items, markAllRead } = useUpdates();

  useEffect(() => {
    markAllRead();
    // Re-run once the list arrives; markAllRead is stable per items/seen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5">
        <h1 className="font-display text-3xl font-bold tracking-tight">Updates</h1>
        <p className="mt-1 font-body text-sm text-gansid-on-surface/60">Announcements &amp; reminders</p>
      </div>
      <AnnouncementsFeed items={items} showHeading={false} />
    </div>
  );
}
