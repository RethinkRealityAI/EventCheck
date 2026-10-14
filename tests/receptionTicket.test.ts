import { describe, expect, it } from 'vitest';
import { hasReceptionTicket, matchesReceptionFilter } from '../utils/receptionTicket';

describe('hasReceptionTicket', () => {
  it('reads the paid add-ons recorded at checkout', () => {
    expect(hasReceptionTicket({ answers: { _addons: ['networking'] } })).toBe(true);
  });

  it('reads add-ons a group purchaser picked for a guest', () => {
    expect(hasReceptionTicket({ answers: { _guest_addons: ['networking'] } })).toBe(true);
  });

  it('is false with no add-ons, other add-ons, or malformed data', () => {
    expect(hasReceptionTicket({ answers: {} })).toBe(false);
    expect(hasReceptionTicket({ answers: null })).toBe(false);
    expect(hasReceptionTicket({ answers: { _addons: ['workshop'] } })).toBe(false);
    expect(hasReceptionTicket({ answers: { _addons: 'networking' } })).toBe(false);
  });
});

describe('matchesReceptionFilter', () => {
  const yes = { answers: { _addons: ['networking'] } };
  const no = { answers: {} };
  it('all lets everyone through', () => {
    expect(matchesReceptionFilter(yes, 'all') && matchesReceptionFilter(no, 'all')).toBe(true);
  });
  it('yes / no split the list', () => {
    expect(matchesReceptionFilter(yes, 'yes')).toBe(true);
    expect(matchesReceptionFilter(no, 'yes')).toBe(false);
    expect(matchesReceptionFilter(no, 'no')).toBe(true);
    expect(matchesReceptionFilter(yes, 'no')).toBe(false);
  });
});
