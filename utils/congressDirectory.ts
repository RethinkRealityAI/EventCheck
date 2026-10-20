import {
  CONGRESS_PROGRAM,
  DAY_DATE,
  SESSION_KIND_LABEL,
  type ProgramSession,
} from '../config/congressProgram';

/**
 * Derived views over the Congress programme: the speaker directory, per-session
 * topics, and the "up next" state the portal home renders.
 *
 * Everything here is pure (no React, no storage) so it is unit-tested in
 * tests/congressDirectory.test.ts. The programme in config/congressProgram.ts
 * is the only source — there is no separate speaker list to keep in sync.
 */

// ── Speakers ────────────────────────────────────────────────────────────────

export type SpeakerRole = 'Speaker' | 'Moderator' | 'Session chair';

export const SPEAKER_ROLES: SpeakerRole[] = ['Speaker', 'Moderator', 'Session chair'];

/** Strings in speakers/moderator/chair that are placeholders, not people. */
export const NOT_PEOPLE = [
  'Selected Abstract Authors',
  'Selected Authors',
  'Industry Speakers',
  'Novo Nordisk',
  'Congress Leadership / Invited Dignitaries',
];

export function isPerson(raw: string | undefined | null): raw is string {
  return !!raw && !NOT_PEOPLE.includes(raw.trim());
}

export interface ParsedPerson {
  /** Name as printed, honorific kept: "Prof. Adekunle Adekile". */
  name: string;
  country: string;
  org: string;
  /** De-duplication key: lowercased, no honorific. */
  key: string;
}

const HONORIFIC = /^(Dr|Prof|Mr|Ms|Mrs)\.?\s+/i;

/** Parse "Dr. Name (Country)" and "Name — Org". */
export function parsePerson(raw: string): ParsedPerson {
  let name = raw.trim();
  let org = '';
  let country = '';
  const dash = name.split(' — ');
  if (dash.length > 1) {
    name = dash[0];
    org = dash.slice(1).join(' — ').trim();
  }
  const m = name.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (m) {
    name = m[1];
    country = m[2].trim();
  }
  name = name.replace(/\s+/g, ' ').trim();
  const key = name.replace(HONORIFIC, '').trim().toLowerCase();
  return { name, country, org, key };
}

export function speakerIdForKey(key: string): string {
  return `p-${key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

export interface SpeakerAppearance {
  sessionId: string;
  role: SpeakerRole;
}

export interface Speaker {
  id: string;
  key: string;
  name: string;
  country: string;
  orgs: string[];
  /** In canonical order: Speaker, Moderator, Session chair. */
  roles: SpeakerRole[];
  appearances: SpeakerAppearance[];
  /** No biographies are in the programme PDF yet. */
  bio?: string;
}

const surname = (key: string) => key.split(' ').slice(-1)[0];

export function buildSpeakerDirectory(sessions: ProgramSession[] = CONGRESS_PROGRAM): Speaker[] {
  const map = new Map<string, Speaker>();

  const touch = (raw: string | undefined, role: SpeakerRole, s: ProgramSession) => {
    if (!isPerson(raw)) return;
    const p = parsePerson(raw);
    if (!p.key) return;
    let e = map.get(p.key);
    if (!e) {
      e = { id: speakerIdForKey(p.key), key: p.key, name: p.name, country: '', orgs: [], roles: [], appearances: [] };
      map.set(p.key, e);
    }
    // Prefer the "Prof." form when a person is printed both ways.
    if (/^Prof\b/i.test(p.name)) e.name = p.name;
    if (p.country && !e.country) e.country = p.country;
    if (p.org && !e.orgs.includes(p.org)) e.orgs.push(p.org);
    if (!e.roles.includes(role)) e.roles.push(role);
    if (!e.appearances.some((a) => a.sessionId === s.id && a.role === role)) {
      e.appearances.push({ sessionId: s.id, role });
    }
  };

  for (const s of sessions) {
    for (const r of s.speakers ?? []) touch(r, 'Speaker', s);
    touch(s.moderator, 'Moderator', s);
    touch(s.chair, 'Session chair', s);
  }

  return [...map.values()]
    .map((e) => ({ ...e, roles: SPEAKER_ROLES.filter((r) => e.roles.includes(r)) }))
    .sort((a, b) => surname(a.key).localeCompare(surname(b.key)) || a.key.localeCompare(b.key));
}

/** Initials for an avatar, honorific skipped: "Dr. Mary Ampomah" → "MA". */
export function initialsFor(name: string): string {
  const parts = name.replace(HONORIFIC, '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w));
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** "Moderator · USA" / "Speaker · Novartis · India". */
export function speakerSubline(p: Pick<Speaker, 'roles' | 'country' | 'orgs'>): string {
  return [p.roles.join(' · '), ...p.orgs, p.country].filter(Boolean).join(' · ');
}

export function countCountries(speakers: Speaker[]): number {
  return new Set(speakers.map((s) => s.country).filter(Boolean)).size;
}

// ── Topics ──────────────────────────────────────────────────────────────────

export const TOPICS: { label: string; re: RegExp }[] = [
  { label: 'Sickle cell', re: /sickle|\bSCD\b/i },
  { label: 'Thalassemia', re: /thalass/i },
  { label: 'Bleeding & clotting', re: /hemophilia|bleeding|willebrand|VWD|thrombo|telangiectasia|HHT|anticoag/i },
  { label: 'Rare anaemias', re: /G6PD|spherocytosis|membrane|pyruvate|PKD|aplastic|marrow failure/i },
  { label: 'Gene & cell therapy', re: /gene therap|cell therap|HSCT|transplant|curative|pipeline|investigational|genetic therap/i },
  { label: 'Transfusion', re: /transfusion|blood safety|hemovigilance|blood supply|iron/i },
  { label: 'Patient voice', re: /patient|lived experience|social justice|community/i },
  { label: 'Policy & access', re: /policy|access|equity|disparit|legal|africa cdc|WHO|national health|mentorship/i },
  { label: 'AI & data', re: /artificial|\bAI\b|registry|data platform|clinical trials/i },
];

export const ALL_TOPICS = 'All topics';

/**
 * Topics for a session. An explicit `session.topics` (set by the programme
 * team) wins; otherwise topics are derived from keywords in the title, track
 * label and talks.
 */
export function topicsForSession(s: ProgramSession): string[] {
  if (s.topics && s.topics.length) return s.topics;
  const hay = [s.title, SESSION_KIND_LABEL[s.kind], ...(s.talks ?? [])].join(' ');
  return TOPICS.filter((t) => t.re.test(hay)).map((t) => t.label);
}

// ── Directory filtering ─────────────────────────────────────────────────────

export interface SpeakerFilters {
  /** 0 = all days. */
  day: 0 | 1 | 2 | 3;
  topic: string;
  role: 'All' | SpeakerRole;
  query: string;
}

export const DEFAULT_SPEAKER_FILTERS: SpeakerFilters = { day: 0, topic: ALL_TOPICS, role: 'All', query: '' };

export function hasActiveFilters(f: SpeakerFilters): boolean {
  return f.day !== 0 || f.topic !== ALL_TOPICS || f.role !== 'All' || f.query.trim() !== '';
}

export interface SpeakerMatch {
  speaker: Speaker;
  /** Appearances that satisfy day AND topic AND role together. */
  appearances: SpeakerAppearance[];
}

/**
 * A person shows when at least one of their appearances matches the day, topic
 * and role filters at the same time. The query matches name, role, country,
 * organisation and the titles of their sessions.
 */
export function filterSpeakers(
  speakers: Speaker[],
  f: SpeakerFilters,
  sessionById: (id: string) => ProgramSession | undefined,
): SpeakerMatch[] {
  const q = f.query.trim().toLowerCase();
  const out: SpeakerMatch[] = [];
  for (const sp of speakers) {
    const appearances = sp.appearances.filter((a) => {
      const s = sessionById(a.sessionId);
      if (!s) return false;
      if (f.day !== 0 && s.day !== f.day) return false;
      if (f.role !== 'All' && a.role !== f.role) return false;
      if (f.topic !== ALL_TOPICS && !topicsForSession(s).includes(f.topic)) return false;
      return true;
    });
    if (appearances.length === 0) continue;
    if (q) {
      const hay = [
        sp.name,
        sp.country,
        ...sp.orgs,
        ...sp.roles,
        ...sp.appearances.map((a) => sessionById(a.sessionId)?.title ?? ''),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push({ speaker: sp, appearances });
  }
  return out;
}

const DAY_SHORT: Record<1 | 2 | 3, string> = { 1: 'Fri', 2: 'Sat', 3: 'Sun' };

/** "2 sessions · Fri, Sun" for the appearances a filter matched. */
export function appearanceSummary(
  appearances: SpeakerAppearance[],
  sessionById: (id: string) => ProgramSession | undefined,
): string {
  const sessions = new Set(appearances.map((a) => a.sessionId));
  const days = [...new Set(appearances.map((a) => sessionById(a.sessionId)?.day).filter(Boolean) as (1 | 2 | 3)[])].sort();
  const n = sessions.size;
  return `${n} session${n === 1 ? '' : 's'} · ${days.map((d) => DAY_SHORT[d]).join(', ')}`;
}

// ── Time (IST) ──────────────────────────────────────────────────────────────

/** Epoch ms for a congress-day local time ("08:35") in IST. */
export function sessionInstant(day: 1 | 2 | 3, time: string): number {
  return Date.parse(`${DAY_DATE[day]}T${time}:00+05:30`);
}

const MONTH_DAY: Record<1 | 2 | 3, string> = { 1: 'Oct 23', 2: 'Oct 24', 3: 'Oct 25' };
const WEEKDAY_DATE: Record<1 | 2 | 3, string> = { 1: 'Fri 23 Oct', 2: 'Sat 24 Oct', 3: 'Sun 25 Oct' };

/** "Oct 23 · 08:35–09:35 · Hall 1" */
export function sessionWhenWhere(s: ProgramSession): string {
  return `${MONTH_DAY[s.day]} · ${s.start}–${s.end} · ${s.room}`;
}

export function weekdayDate(day: 1 | 2 | 3): string {
  return WEEKDAY_DATE[day];
}

export function isBreakSession(s: ProgramSession): boolean {
  return s.kind === 'break' || s.kind === 'logistics';
}

/** IST calendar date (YYYY-MM-DD) for an instant. */
function istDate(now: number): string {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export type CongressPhase =
  | { kind: 'before'; days: number }
  | { kind: 'live'; day: 1 | 2 | 3 }
  | { kind: 'ended' };

/** Where "now" sits relative to the three congress days. */
export function congressPhase(now: number, sessions: ProgramSession[] = CONGRESS_PROGRAM): CongressPhase {
  const last = sessions.reduce((max, s) => Math.max(max, sessionInstant(s.day, s.end)), 0);
  if (now >= last) return { kind: 'ended' };
  const today = istDate(now);
  for (const d of [1, 2, 3] as const) if (DAY_DATE[d] === today) return { kind: 'live', day: d };
  const days = Math.round((Date.parse(DAY_DATE[1]) - Date.parse(today)) / 86_400_000);
  if (days <= 0) return { kind: 'ended' };
  return { kind: 'before', days };
}

/** Countdown pill copy: "N days to go" → "Tomorrow" → "Day N · Live" → "Ended". */
export function countdownLabel(phase: CongressPhase): string {
  if (phase.kind === 'ended') return 'Ended';
  if (phase.kind === 'live') return `Day ${phase.day} · Live`;
  return phase.days === 1 ? 'Tomorrow' : `${phase.days} days to go`;
}

export interface UpNext {
  session: ProgramSession;
  /** The session has started and not yet ended. */
  live: boolean;
  /** Other sessions starting on the same day at the same time. */
  parallel: ProgramSession[];
}

const byStart = (a: ProgramSession, b: ProgramSession) => a.day - b.day || a.start.localeCompare(b.start);

/** First non-break session (by IST start) whose end is after now. */
export function upNext(now: number, sessions: ProgramSession[] = CONGRESS_PROGRAM): UpNext | null {
  const ordered = sessions.filter((s) => !isBreakSession(s)).sort(byStart);
  const session = ordered.find((s) => sessionInstant(s.day, s.end) > now);
  if (!session) return null;
  return {
    session,
    live: sessionInstant(session.day, session.start) <= now,
    parallel: ordered.filter((s) => s.id !== session.id && s.day === session.day && s.start === session.start),
  };
}

/** Next saved session still to finish, in running order. */
export function nextSaved(now: number, saved: ProgramSession[]): ProgramSession | null {
  return [...saved].sort(byStart).find((s) => sessionInstant(s.day, s.end) > now) ?? null;
}

/** The registration desk opens at 07:00 on day one. */
export function congressStarted(now: number): boolean {
  return now >= sessionInstant(1, '07:00');
}
