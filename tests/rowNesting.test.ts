import { describe, it, expect } from 'vitest';
import { nestUnderParents } from '../utils/rowNesting';

const row = (id: string, primaryAttendeeId: string | null = null, seat = 0) => ({ id, primaryAttendeeId, seat });

describe('nestUnderParents', () => {
  it('nests every child under its parent, whatever kind of guest it is', () => {
    // A TSCS companion, a BOGO guest and a sponsor delegate all carry
    // primaryAttendeeId — the old list nested none of them.
    const rows = [row('buyer'), row('companion', 'buyer'), row('org'), row('delegate-1', 'org'), row('delegate-2', 'org')];
    const { top, childrenOf } = nestUnderParents(rows);
    expect(top.map(r => r.id)).toEqual(['buyer', 'org']);
    expect(childrenOf.get('buyer')?.map(r => r.id)).toEqual(['companion']);
    expect(childrenOf.get('org')?.map(r => r.id)).toEqual(['delegate-1', 'delegate-2']);
  });

  it('keeps a child top-level when its parent is not in the list', () => {
    // A search that matches only the guest must still show the guest.
    const { top, childrenOf } = nestUnderParents([row('guest', 'buyer-filtered-out')]);
    expect(top.map(r => r.id)).toEqual(['guest']);
    expect(childrenOf.size).toBe(0);
  });

  it('keeps top-level order and nests regardless of where the child appears', () => {
    // Sorted by date, a guest can come before its parent — or pages later.
    const rows = [row('late-guest', 'b'), row('a'), row('b'), row('c')];
    const { top, childrenOf } = nestUnderParents(rows);
    expect(top.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(childrenOf.get('b')?.map(r => r.id)).toEqual(['late-guest']);
  });

  it('orders children with the comparator when one is given', () => {
    const rows = [row('p'), row('g3', 'p', 3), row('g1', 'p', 1), row('g2', 'p', 2)];
    const { childrenOf } = nestUnderParents(rows, (x, y) => x.seat - y.seat);
    expect(childrenOf.get('p')?.map(r => r.id)).toEqual(['g1', 'g2', 'g3']);
  });

  it('never nests a row under itself', () => {
    const { top } = nestUnderParents([row('self', 'self')]);
    expect(top.map(r => r.id)).toEqual(['self']);
  });

  it('accounts for every row exactly once', () => {
    const rows = [row('a'), row('a1', 'a'), row('b', 'zzz'), row('c'), row('c1', 'c'), row('c2', 'c')];
    const { top, childrenOf } = nestUnderParents(rows);
    const nested = [...childrenOf.values()].flat();
    expect(top.length + nested.length).toBe(rows.length);
    expect(new Set([...top, ...nested].map(r => r.id)).size).toBe(rows.length);
  });
});
