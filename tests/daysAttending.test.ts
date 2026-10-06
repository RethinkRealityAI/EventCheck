import { describe, it, expect } from 'vitest';
import {
  daysAttendingOf, distinctDays, matchesDaysFilter, shortDayLabel, daysFilterLabel, DAYS_NOT_SPECIFIED,
} from '../utils/daysAttending';

const D23 = 'October 23, 2026';
const D24 = 'October 24, 2026';
const D25 = 'October 25, 2026';
const row = (days: unknown) => ({ answers: days === undefined ? {} : { f_days: days } });

describe('daysAttendingOf', () => {
  it('reads the checkbox array, trimmed and de-duplicated', () => {
    expect(daysAttendingOf(row([D23, ` ${D24} `, D23]))).toEqual([D23, D24]);
  });
  it('accepts a single string (imports / older rows)', () => {
    expect(daysAttendingOf(row(D25))).toEqual([D25]);
  });
  it('is empty for no answer, null answers, or junk', () => {
    expect(daysAttendingOf(row(undefined))).toEqual([]);
    expect(daysAttendingOf({ answers: null })).toEqual([]);
    expect(daysAttendingOf(row([null, 3, '']))).toEqual([]);
  });
});

describe('distinctDays', () => {
  it('orders by date, not by text', () => {
    expect(distinctDays([row([D25]), row([D23, D24]), row(undefined)])).toEqual([D23, D24, D25]);
  });
  it('puts unparseable labels after real dates', () => {
    expect(distinctDays([row(['Gala night', D24])])).toEqual([D24, 'Gala night']);
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
    expect(matchesDaysFilter(both, D24)).toBe(true);
    expect(matchesDaysFilter(both, D25)).toBe(false);
  });
  it('"not specified" matches only rows with no days — never "all days"', () => {
    expect(matchesDaysFilter(none, DAYS_NOT_SPECIFIED)).toBe(true);
    expect(matchesDaysFilter(both, DAYS_NOT_SPECIFIED)).toBe(false);
  });
});

describe('labels', () => {
  it('shortens a date label to month + day', () => {
    expect(shortDayLabel(D23)).toBe('Oct 23');
    expect(shortDayLabel('Gala night')).toBe('Gala night');
  });
  it('describes the filter for the active-filter chip', () => {
    expect(daysFilterLabel(D25)).toBe('Attending Oct 25');
    expect(daysFilterLabel(DAYS_NOT_SPECIFIED)).toBe('Days: not specified');
  });
});
