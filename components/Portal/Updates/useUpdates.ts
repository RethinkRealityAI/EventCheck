import { useCallback, useEffect, useMemo, useState } from 'react';
import { listActiveAnnouncements } from '../../../services/announcementService';
import { CURRENT_SITE } from '../../../config/sites';
import type { Announcement } from '../../../types';
import { useAuth } from '../../AuthContext';

/**
 * Portal updates (the CMS announcements) plus a per-device "seen" set, so the
 * home Updates card can show an unread count. Like My Schedule, read state is
 * localStorage keyed by user id — no migration, works offline.
 */

const KEY_PREFIX = 'gansid:updates-seen';
/** Fired on this window when read state changes, so the header bell and the
 *  home Updates card (separate hook instances) update together. */
const SEEN_EVENT = 'gansid:updates-seen-changed';
const key = (userId?: string | null) => `${KEY_PREFIX}:${userId ?? 'guest'}`;

function readSeen(userId?: string | null): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export const UPDATES_LIMIT = 20;

export function useUpdates() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [items, setItems] = useState<Announcement[]>([]);
  const [seen, setSeen] = useState<string[]>(() => readSeen(userId));

  useEffect(() => {
    let alive = true;
    listActiveAnnouncements(CURRENT_SITE.key, UPDATES_LIMIT).then((list) => alive && setItems(list));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const sync = () => setSeen(readSeen(userId));
    sync();
    const onStorage = (e: StorageEvent) => e.key === key(userId) && sync();
    window.addEventListener(SEEN_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(SEEN_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  // Newest first, as listActiveAnnouncements returns them.
  const unread = useMemo(() => items.filter((a) => !seen.includes(a.id)), [items, seen]);

  const markAllRead = useCallback(() => {
    if (items.length === 0) return;
    const next = [...new Set([...seen, ...items.map((a) => a.id)])];
    setSeen(next);
    try {
      localStorage.setItem(key(userId), JSON.stringify(next));
    } catch {
      /* private mode — read state simply does not persist */
    }
    window.dispatchEvent(new Event(SEEN_EVENT));
  }, [items, seen, userId]);

  return { items, unread, markAllRead };
}
