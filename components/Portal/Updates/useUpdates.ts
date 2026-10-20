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

  useEffect(() => setSeen(readSeen(userId)), [userId]);

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
  }, [items, seen, userId]);

  return { items, unread, markAllRead };
}
