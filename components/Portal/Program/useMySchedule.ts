import { useCallback, useEffect, useMemo, useState } from 'react';
import { CONGRESS_PROGRAM, DAY_DATE, overlaps, type ProgramSession } from '../../../config/congressProgram';
import { useAuth } from '../../AuthContext';

/**
 * "Build your own schedule" — the bookmark store behind the interactive
 * programme and My Schedule.
 *
 * Storage is localStorage, keyed per user id so two accounts on one device do
 * not share a plan. It is deliberately dependency-free: no migration, no DB
 * round-trip, and it keeps working offline (the app is a PWA). When a
 * `my_schedule` table lands later, swap the read/write helpers here and every
 * consumer keeps working.
 */

const KEY_PREFIX = 'gansid:my-schedule';

function storageKey(userId?: string | null): string {
  return `${KEY_PREFIX}:${userId ?? 'guest'}`;
}

function read(userId?: string | null): string[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function write(userId: string | null | undefined, ids: string[]): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    /* quota or private mode — the plan simply does not persist */
  }
}

export function useMySchedule() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [ids, setIds] = useState<string[]>(() => read(userId));

  // Re-read when the signed-in user changes (sign in / sign out / switch).
  useEffect(() => {
    setIds(read(userId));
  }, [userId]);

  // Keep multiple open tabs in step.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === storageKey(userId)) setIds(read(userId));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [userId]);

  const has = useCallback((id: string) => ids.includes(id), [ids]);

  const toggle = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
        write(userId, next);
        return next;
      });
    },
    [userId],
  );

  const remove = useCallback(
    (id: string) => {
      setIds((prev) => {
        const next = prev.filter((v) => v !== id);
        write(userId, next);
        return next;
      });
    },
    [userId],
  );

  const clear = useCallback(() => {
    setIds([]);
    write(userId, []);
  }, [userId]);

  /** Saved sessions in running order, day by day. */
  const sessions = useMemo<ProgramSession[]>(
    () =>
      CONGRESS_PROGRAM.filter((s) => ids.includes(s.id)).sort(
        (a, b) => a.day - b.day || a.start.localeCompare(b.start),
      ),
    [ids],
  );

  /** Ids of saved sessions that clash with another saved session. */
  const clashing = useMemo<Set<string>>(() => {
    const out = new Set<string>();
    for (let i = 0; i < sessions.length; i += 1) {
      for (let j = i + 1; j < sessions.length; j += 1) {
        if (overlaps(sessions[i], sessions[j])) {
          out.add(sessions[i].id);
          out.add(sessions[j].id);
        }
      }
    }
    return out;
  }, [sessions]);

  return { ids, sessions, count: sessions.length, has, toggle, remove, clear, clashing };
}

/**
 * Build an .ics calendar for the saved sessions. Times are IST (UTC+05:30) —
 * emitted as UTC so any calendar app lands on the right slot.
 */
export function buildIcs(sessions: ProgramSession[]): string {
  const toUtc = (day: 1 | 2 | 3, time: string): string => {
    const [h, m] = time.split(':').map(Number);
    const iso = `${DAY_DATE[day]}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`;
    return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };

  const escape = (v: string) => v.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GANSID Congress 2026//Congress App//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GANSID Congress 2026 — My Schedule',
  ];

  for (const s of sessions) {
    const details = [
      s.stream ? `Stream: ${s.stream}` : '',
      s.speakers?.length ? `Speakers: ${s.speakers.join(', ')}` : '',
      s.moderator ? `Moderator: ${s.moderator}` : '',
      s.chair ? `Session chair: ${s.chair}` : '',
      s.talks?.length ? `\n${s.talks.map((t) => `• ${t}`).join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@gansid-congress-2026`,
      `DTSTAMP:${toUtc(s.day, s.start)}`,
      `DTSTART:${toUtc(s.day, s.start)}`,
      `DTEND:${toUtc(s.day, s.end)}`,
      `SUMMARY:${escape(s.title)}`,
      `LOCATION:${escape(`${s.room}, HICC / Novotel, Hyderabad`)}`,
      `DESCRIPTION:${escape(details)}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadIcs(sessions: ProgramSession[], filename = 'gansid-congress-2026.ics'): void {
  const blob = new Blob([buildIcs(sessions)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
