import { describe, expect, it } from 'vitest';
import { CONGRESS_PROGRAM, sessionById, type ProgramSession } from '../config/congressProgram';
import {
  ALL_TOPICS,
  abstractsByPerson,
  DEFAULT_SPEAKER_FILTERS,
  appearanceSummary,
  buildSpeakerDirectory,
  congressPhase,
  congressStarted,
  countCountries,
  countdownLabel,
  filterSpeakers,
  hasActiveFilters,
  initialsFor,
  isPerson,
  nextSaved,
  parsePerson,
  sessionInstant,
  sessionWhen,
  sessionWhenWhere,
  speakerSubline,
  topicsForSession,
  upNext,
} from '../utils/congressDirectory';

const s = (over: Partial<ProgramSession>): ProgramSession => ({
  id: 'x',
  day: 1,
  start: '08:00',
  end: '09:00',
  title: 'Session',
  kind: 'plenary',
  room: 'Hall 1',
  ...over,
});

const ist = (date: string, time: string) => Date.parse(`${date}T${time}:00+05:30`);

describe('parsePerson', () => {
  it('splits name and country', () => {
    expect(parsePerson('Dr. Alok Srivastava (India)')).toEqual({
      name: 'Dr. Alok Srivastava',
      country: 'India',
      org: '',
      key: 'alok srivastava',
    });
  });

  it('splits name and organisation on an em dash', () => {
    const p = parsePerson('Ms. Lanre Tunji-Ajayi — GANSID CEO');
    expect(p.name).toBe('Ms. Lanre Tunji-Ajayi');
    expect(p.org).toBe('GANSID CEO');
    expect(p.key).toBe('lanre tunji-ajayi');
  });

  it('drops every honorific from the key', () => {
    for (const h of ['Dr.', 'Prof.', 'Mr.', 'Ms.', 'Mrs.', 'Dr']) {
      expect(parsePerson(`${h} Jane Doe`).key).toBe('jane doe');
    }
  });
});

describe('isPerson', () => {
  it('rejects placeholders and blanks', () => {
    expect(isPerson('Selected Abstract Authors')).toBe(false);
    expect(isPerson('Congress Leadership / Invited Dignitaries')).toBe(false);
    expect(isPerson('Novo Nordisk')).toBe(false);
    expect(isPerson(undefined)).toBe(false);
    expect(isPerson('Dr. A B (India)')).toBe(true);
  });
});

describe('buildSpeakerDirectory', () => {
  const sessions = [
    s({ id: 'a', speakers: ['Dr. Jane Doe (Ghana)', 'Selected Abstract Authors'], moderator: 'Mr. Zed Able (USA)' }),
    s({ id: 'b', day: 2, speakers: ['Prof. Jane Doe (Ghana)'], chair: 'Dr. Zed Able (USA)' }),
  ];
  const dir = buildSpeakerDirectory(sessions);

  it('de-duplicates across honorifics and prefers the Prof. form', () => {
    expect(dir).toHaveLength(2);
    const jane = dir.find((p) => p.key === 'jane doe')!;
    expect(jane.name).toBe('Prof. Jane Doe');
    expect(jane.appearances.map((a) => a.sessionId)).toEqual(['a', 'b']);
  });

  it('collects roles in canonical order', () => {
    const zed = dir.find((p) => p.key === 'zed able')!;
    expect(zed.roles).toEqual(['Moderator', 'Session chair']);
  });

  it('sorts by surname', () => {
    expect(dir.map((p) => p.key)).toEqual(['zed able', 'jane doe']);
  });

  it('excludes placeholders', () => {
    expect(dir.some((p) => /selected/i.test(p.name))).toBe(false);
  });

  it('builds the real directory without placeholders or duplicates', () => {
    const real = buildSpeakerDirectory(CONGRESS_PROGRAM);
    expect(real.length).toBeGreaterThan(40);
    expect(new Set(real.map((p) => p.key)).size).toBe(real.length);
    expect(new Set(real.map((p) => p.id)).size).toBe(real.length);
    expect(real.some((p) => /selected|industry speakers|leadership/i.test(p.name))).toBe(false);
    expect(countCountries(real)).toBeGreaterThan(5);
  });
});

describe('initialsFor / speakerSubline / sessionWhenWhere', () => {
  it('skips honorifics', () => {
    expect(initialsFor('Dr. Mary Ampomah')).toBe('MA');
    expect(initialsFor('Prof. K.K. Radhika')).toBe('KR');
    expect(initialsFor('Madonna')).toBe('M');
  });

  it('joins roles, orgs and country', () => {
    expect(speakerSubline({ roles: ['Speaker', 'Moderator'], orgs: [], country: 'India' })).toBe('Speaker · Moderator · India');
    expect(speakerSubline({ roles: ['Speaker'], orgs: ['GANSID CEO'], country: '' })).toBe('Speaker · GANSID CEO');
  });

  it('formats a session time without the room', () => {
    expect(sessionWhen(s({ day: 2, start: '10:30', end: '11:30', room: 'Room 6' }))).toBe('Oct 24 · 10:30–11:30');
  });

  it('formats a session line', () => {
    expect(sessionWhenWhere(s({ day: 3, start: '14:40', end: '15:40', room: 'Hall 2' }))).toBe('Oct 25 · 14:40–15:40 · Hall 2');
  });
});

describe('topicsForSession', () => {
  it('derives topics from title and talks', () => {
    expect(topicsForSession(s({ title: 'Sickle cell disease in Africa', talks: ['Gene therapy for SCD'] }))).toEqual([
      'Sickle cell',
      'Gene & cell therapy',
    ]);
  });

  it('counts the track label', () => {
    expect(topicsForSession(s({ title: 'Lunch talk', kind: 'patient' }))).toContain('Patient voice');
  });

  it('lets an explicit override win', () => {
    expect(topicsForSession(s({ title: 'Sickle cell', topics: ['AI & data'] }))).toEqual(['AI & data']);
  });
});

describe('filterSpeakers', () => {
  const sessions = [
    s({ id: 'sc', day: 1, title: 'Sickle cell care', speakers: ['Dr. Jane Doe (Ghana)'], moderator: 'Dr. Zed Able (USA)' }),
    s({ id: 'th', day: 2, title: 'Thalassemia update', moderator: 'Dr. Jane Doe (Ghana)' }),
  ];
  const dir = buildSpeakerDirectory(sessions);
  const byId = (id: string) => sessions.find((x) => x.id === id);

  it('shows everyone with default filters', () => {
    expect(filterSpeakers(dir, DEFAULT_SPEAKER_FILTERS, byId)).toHaveLength(2);
    expect(hasActiveFilters(DEFAULT_SPEAKER_FILTERS)).toBe(false);
  });

  it('requires one appearance to match day, topic and role together', () => {
    // Jane speaks on day 1 (sickle) and moderates on day 2 (thal). Day 2 + Speaker
    // must NOT match, even though she is a speaker and appears on day 2.
    const f = { ...DEFAULT_SPEAKER_FILTERS, day: 2 as const, role: 'Speaker' as const };
    expect(filterSpeakers(dir, f, byId)).toHaveLength(0);
    const g = { ...DEFAULT_SPEAKER_FILTERS, day: 2 as const, role: 'Moderator' as const };
    expect(filterSpeakers(dir, g, byId).map((m) => m.speaker.key)).toEqual(['jane doe']);
  });

  it('filters by topic', () => {
    const f = { ...DEFAULT_SPEAKER_FILTERS, topic: 'Thalassemia' };
    const res = filterSpeakers(dir, f, byId);
    expect(res.map((m) => m.speaker.key)).toEqual(['jane doe']);
    expect(res[0].appearances.map((a) => a.sessionId)).toEqual(['th']);
    expect(hasActiveFilters(f)).toBe(true);
  });

  it('matches the query against country and session titles', () => {
    expect(filterSpeakers(dir, { ...DEFAULT_SPEAKER_FILTERS, query: 'usa' }, byId).map((m) => m.speaker.key)).toEqual(['zed able']);
    expect(filterSpeakers(dir, { ...DEFAULT_SPEAKER_FILTERS, query: 'thalassemia' }, byId).map((m) => m.speaker.key)).toEqual(['jane doe']);
  });

  it('summarises the matched appearances', () => {
    const jane = filterSpeakers(dir, DEFAULT_SPEAKER_FILTERS, byId).find((m) => m.speaker.key === 'jane doe')!;
    expect(appearanceSummary(jane.appearances, byId)).toBe('2 sessions · Fri, Sat');
    expect(ALL_TOPICS).toBe('All topics');
  });
});

describe('congressPhase / countdownLabel', () => {
  it('counts down in IST calendar days', () => {
    expect(countdownLabel(congressPhase(ist('2026-10-20', '12:00')))).toBe('3 days to go');
    expect(countdownLabel(congressPhase(ist('2026-10-22', '23:30')))).toBe('Tomorrow');
  });

  it('uses the IST date, not UTC', () => {
    // 23:30 UTC on Oct 22 is already 05:00 on Oct 23 in Hyderabad.
    expect(congressPhase(Date.parse('2026-10-22T23:30:00Z'))).toEqual({ kind: 'live', day: 1 });
  });

  it('is live on each congress day and ended after the last session', () => {
    expect(countdownLabel(congressPhase(ist('2026-10-24', '10:00')))).toBe('Day 2 · Live');
    expect(countdownLabel(congressPhase(ist('2026-10-25', '16:30')))).toBe('Ended');
    expect(countdownLabel(congressPhase(ist('2026-11-01', '09:00')))).toBe('Ended');
  });
});

describe('upNext', () => {
  it('picks the first non-break session and reports parallels', () => {
    const before = upNext(ist('2026-10-20', '09:00'))!;
    expect(before.session.id).toBe('d1-opening');
    expect(before.live).toBe(false);
  });

  it('marks a running session live and skips breaks', () => {
    const during = upNext(ist('2026-10-23', '08:10'))!;
    expect(during.session.id).toBe('d1-opening');
    expect(during.live).toBe(true);
    const inBreak = upNext(ist('2026-10-23', '09:45'))!;
    expect(inBreak.session.kind).not.toBe('break');
    expect(inBreak.session.start).toBe('10:00');
    expect(inBreak.parallel.length).toBeGreaterThan(0);
    expect(inBreak.parallel.every((p) => p.start === '10:00' && p.day === 1)).toBe(true);
  });

  it('returns null once everything has finished', () => {
    expect(upNext(ist('2026-10-26', '09:00'))).toBeNull();
  });
});

describe('nextSaved / congressStarted / sessionInstant', () => {
  it('finds the next unfinished saved session in running order', () => {
    const saved = [sessionById('d3-patient')!, sessionById('d1-plenary-1')!];
    expect(nextSaved(ist('2026-10-20', '09:00'), saved)?.id).toBe('d1-plenary-1');
    expect(nextSaved(ist('2026-10-23', '10:00'), saved)?.id).toBe('d3-patient');
    expect(nextSaved(ist('2026-10-26', '10:00'), saved)).toBeNull();
  });

  it('starts when the desk opens on day one', () => {
    expect(congressStarted(ist('2026-10-23', '06:59'))).toBe(false);
    expect(congressStarted(ist('2026-10-23', '07:00'))).toBe(true);
    expect(sessionInstant(1, '08:00')).toBe(Date.parse('2026-10-23T02:30:00Z'));
  });
});

describe('oral abstracts', () => {
  const abstractSessions = CONGRESS_PROGRAM.filter((s) => s.kind === 'abstracts');

  it('names real presenters, not placeholders, in every abstract session', () => {
    expect(abstractSessions).toHaveLength(11);
    for (const s of abstractSessions) {
      expect(s.abstracts?.length, s.id).toBeGreaterThan(0);
      expect(s.speakers?.every((p) => isPerson(p)), s.id).toBe(true);
    }
  });

  it('keeps each abstract inside its session and lists every presenter as a speaker', () => {
    for (const s of abstractSessions) {
      for (const a of s.abstracts ?? []) {
        expect(a.start >= s.start && a.end <= s.end, `${s.id} ${a.start}`).toBe(true);
        for (const p of a.presenters) expect(s.speakers, s.id).toContain(p);
      }
    }
  });

  it('leaves out withdrawn abstracts and applies the Tayade/Sagar swap', () => {
    expect(JSON.stringify(abstractSessions)).not.toMatch(/Gayatri Desai|Prosanto/);
    const slot = (id: string, start: string) => sessionById(id)!.abstracts!.find((a) => a.start === start)!.presenters;
    expect(slot('d1-abs-room6', '10:28')).toEqual(['Parag Sagar']);
    expect(slot('d3-trainees', '11:58')).toEqual(['Dr. Naresh Tayade']);
  });

  it('finds a presenter’s abstracts by name key', () => {
    const s = sessionById('d3-abs-hall2')!;
    expect(abstractsByPerson(s, 'lanre tunji-ajayi').map((a) => a.start)).toEqual(['10:39']);
    const dir = buildSpeakerDirectory();
    const reddy = dir.find((p) => p.key === 'mohana reddy')!;
    expect(reddy.appearances.map((a) => a.sessionId).sort()).toEqual(
      ['d1-abs-hall1', 'd1-abs-room6', 'd3-abs-hall1', 'd3-abs-room6'].sort(),
    );
  });
});
