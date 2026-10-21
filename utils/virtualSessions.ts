import { parsePerson } from './congressDirectory';

/**
 * Virtual presentations — sessions with presenters joining over Zoom. The data
 * lives in the `virtual_sessions` table behind RLS (admins + listed presenters
 * only; see 20261020120000_add_virtual_sessions.sql). These helpers are pure
 * so they are unit-tested in tests/virtualSessions.test.ts.
 */

export interface VirtualPresenter {
  /** Ties the presenter to their email rows in virtual_presenters. */
  key: string;
  name: string;
  role: string;
}

export interface VirtualSession {
  sessionId: string;
  zoomUrl: string;
  meetingId: string | null;
  presenters: VirtualPresenter[];
}

/** DB row → VirtualSession, tolerating a malformed presenters column. */
export function mapVirtualSessionRow(row: any): VirtualSession | null {
  if (!row || typeof row.session_id !== 'string' || typeof row.zoom_url !== 'string') return null;
  const raw = Array.isArray(row.presenters) ? row.presenters : [];
  const presenters: VirtualPresenter[] = raw
    .filter((p: any) => p && typeof p.name === 'string' && p.name.trim())
    .map((p: any) => ({
      key: typeof p.key === 'string' ? p.key : '',
      name: p.name.trim(),
      role: typeof p.role === 'string' && p.role.trim() ? p.role.trim() : 'Speaker',
    }));
  return {
    sessionId: row.session_id,
    zoomUrl: row.zoom_url,
    meetingId: typeof row.meeting_id === 'string' && row.meeting_id ? row.meeting_id : null,
    presenters,
  };
}

/** "86701701992" → "867 0170 1992", the grouping Zoom itself shows. */
export function formatMeetingId(id: string | null | undefined): string {
  const digits = String(id ?? '').replace(/\D/g, '');
  if (digits.length < 9) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
}

/** Is the signed-in presenter (by key) one of this session's virtual presenters? */
export function isPresenterIn(vs: VirtualSession, key: string | null | undefined): boolean {
  return !!key && vs.presenters.some((p) => p.key === key);
}

/**
 * Is a programme person string ("Mr. Carl Lander (UK)") one of the session's
 * virtual presenters? Compared on the honorific-free name key, so "Dr." vs
 * "Prof." or a country suffix never breaks the match.
 */
export function isVirtualPerson(vs: VirtualSession | undefined, programmeName: string): boolean {
  if (!vs) return false;
  const key = parsePerson(programmeName).key;
  return vs.presenters.some((p) => parsePerson(p.name).key === key);
}

/** "Mr. Carl Lander · Dr. Baba Inusa (Moderator)" — Speaker is the default, so it is left unsaid. */
export function virtualPresenterLine(vs: VirtualSession): string {
  return vs.presenters
    .map((p) => (p.role && p.role !== 'Speaker' ? `${p.name} (${p.role})` : p.name))
    .join(' · ');
}
