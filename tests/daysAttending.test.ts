import { describe, it, expect } from 'vitest';
import {
  dayKey, daysAttendingOf, distinctDays, matchesDaysFilter, shortDayLabel, daysFilterLabel, DAYS_NOT_SPECIFIED,
} from '../utils/daysAttending';

const D23 = 'October 23, 2026';
const D24 = 'October 24, 2026';
const D25 = 'October 25, 2026';
const K23 = '2026-10-23';
const K24 = '2026-10-24';
const K25 = '2026-10-25';
const row = (days: unknown) => ({ answers: days === undefined ? {} : { f_days: days } });

describe('daysAttendingOf', () => {
  it('reads the checkbox array as day keys, trimmed and de-duplicated', () => {
    expect(daysAttendingOf(row([D23, ` ${D24} `, D23]))).toEqual([K23, K24]);
  });
  it('treats "Oct 23, 2026" (TSCS ingest) and "October 23, 2026" (form) as the same day', () => {
    expect(daysAttendingOf(row(['Oct 23, 2026', D23]))).toEqual([K23]);
    expect(dayKey('Oct 23, 2026')).toBe(dayKey(D23));
  });
  it('accepts a single string (imports / older rows)', () => {
    expect(daysAttendingOf(row(D25))).toEqual([K25]);
  });
  it('is empty for no answer, null answers, or junk', () => {
    expect(daysAttendingOf(row(undefined))).toEqual([]);
    expect(daysAttendingOf({ answers: null })).toEqual([]);
    expect(daysAttendingOf(row([null, 3, '']))).toEqual([]);
  });
});

describe('distinctDays', () => {
  it('orders by date, not by text', () => {
    expect(distinctDays([row([D25]), row([D23, D24]), row(undefined)])).toEqual([K23, K24, K25]);
  });
  it('lists each day once whichever way it was written', () => {
    expect(distinctDays([row(['Oct 23, 2026']), row([D23])])).toEqual([K23]);
  });
  it('puts unparseable labels after real dates', () => {
    expect(distinctDays([row(['Gala night', D24])])).toEqual([K24, 'Gala night']);
  });
});

describe('matchesDaysFilter', () => {
  const both = row([D23, D24]);
  const none = row(undefined);
  it('all matches everyone', () => {
    expect(matchesDaysFilter(both, 'all')).toBe(true);
    expect(matchesDaysFilter(none, 'all')).toBe(true);
  });
  it('a day matches anyone attending that day, multi-day included', () => {
    expect(matchesDaysFilter(both, K24)).toBe(true);
    expect(matchesDaysFilter(both, K25)).toBe(false);
    expect(matchesDaysFilter(row(['Oct 24, 2026']), K24)).toBe(true);
  });
  it('"not specified" matches only rows with no days — never "all days"', () => {
    expect(matchesDaysFilter(none, DAYS_NOT_SPECIFIED)).toBe(true);
    expect(matchesDaysFilter(both, DAYS_NOT_SPECIFIED)).toBe(false);
  });
});

describe('labels', () => {
  it('shortens a date label to month + day', () => {
    expect(shortDayLabel(K23)).toBe('Oct 23');
    expect(shortDayLabel('Gala night')).toBe('Gala night');
  });
  it('describes the filter for the active-filter chip', () => {
    expect(daysFilterLabel(K25)).toBe('Attending Oct 25');
    expect(daysFilterLabel(DAYS_NOT_SPECIFIED)).toBe('Days: not specified');
  });
});
