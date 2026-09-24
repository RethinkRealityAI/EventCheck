import { describe, it, expect } from 'vitest';
import {
  claimStateOf,
  planClaim,
  isPlausibleEmail,
  MOVED_TO_KEY,
  type ClaimRow,
} from '../supabase/functions/_shared/accountClaim';

const row = (over: Partial<ClaimRow> = {}): ClaimRow => ({
  email: 'guest@example.com',
  user_id: null,
  guest_type: null,
  primary_attendee_id: 'p-1',
  answers: {},
  ...over,
});

describe('claimStateOf', () => {
  it('a companion with their own address and no account is open', () => {
    expect(claimStateOf(row(), 'buyer@example.com')).toEqual({ kind: 'open', sharedEmail: false });
  });

  it('a companion under the purchaser\'s address is open even though the purchaser has an account', () => {
    const r = row({ email: 'Buyer@Example.com', user_id: 'buyer-uid' });
    expect(claimStateOf(r, 'buyer@example.com')).toEqual({ kind: 'open', sharedEmail: true });
  });

  it('a ticket linked to an account at its own address is linked', () => {
    expect(claimStateOf(row({ user_id: 'u-1' }), 'buyer@example.com')).toEqual({ kind: 'linked' });
  });

  it('a purchaser is never "shared", even with no primary email passed', () => {
    expect(claimStateOf(row({ primary_attendee_id: null }), null)).toEqual({ kind: 'open', sharedEmail: false });
    expect(claimStateOf(row({ primary_attendee_id: null, user_id: 'u' }), null)).toEqual({ kind: 'linked' });
  });

  it('unnamed seats go through the ?ref= claim form instead', () => {
    expect(claimStateOf(row({ email: 'guest-x@placeholder.invalid' }), 'b@x.com').kind).toBe('unavailable');
    expect(claimStateOf(row({ guest_type: 'pending-claim' }), 'b@x.com').kind).toBe('unavailable');
  });
});

describe('planClaim', () => {
  it('creates a verified account at the emailed (own) address', () => {
    const r = row();
    expect(planClaim(claimStateOf(r, 'b@x.com'), r, ' Guest@Example.com ', 'b@x.com')).toEqual({ action: 'create-verified' });
  });

  it('refuses the shared address and asks for their own', () => {
    const r = row({ email: 'b@x.com', user_id: 'buyer' });
    expect(planClaim(claimStateOf(r, 'b@x.com'), r, 'b@x.com', 'b@x.com'))
      .toEqual({ action: 'reject', reason: 'needs-own-email' });
  });

  it('moves a shared-address ticket to the companion\'s own address', () => {
    const r = row({ email: 'b@x.com', user_id: 'buyer' });
    expect(planClaim(claimStateOf(r, 'b@x.com'), r, 'Me@Mine.org', 'b@x.com'))
      .toEqual({ action: 'move', email: 'me@mine.org' });
  });

  it('never moves a ticket onto the purchaser\'s address', () => {
    const r = row();
    expect(planClaim(claimStateOf(r, 'b@x.com'), r, 'B@x.com', 'b@x.com'))
      .toEqual({ action: 'reject', reason: 'purchaser-email' });
  });

  it('does not pre-verify an address the page itself moved the ticket to', () => {
    const r = row({ email: 'typed@mine.org', answers: { [MOVED_TO_KEY]: 'typed@mine.org' } });
    expect(planClaim(claimStateOf(r, 'b@x.com'), r, 'typed@mine.org', 'b@x.com')).toEqual({ action: 'signup-unverified' });
  });

  it('refuses a linked ticket and an unavailable seat', () => {
    const linked = row({ user_id: 'u' });
    expect(planClaim(claimStateOf(linked, 'b@x.com'), linked, 'new@x.org', 'b@x.com'))
      .toEqual({ action: 'reject', reason: 'already-linked' });
    const pending = row({ guest_type: 'pending-claim' });
    expect(planClaim(claimStateOf(pending, 'b@x.com'), pending, 'new@x.org', 'b@x.com'))
      .toEqual({ action: 'reject', reason: 'unavailable' });
  });

  it('rejects implausible addresses before anything moves', () => {
    const r = row();
    expect(planClaim(claimStateOf(r, 'b@x.com'), r, 'not-an-email', 'b@x.com'))
      .toEqual({ action: 'reject', reason: 'invalid-email' });
  });
});

describe('isPlausibleEmail', () => {
  it.each(['a@b.co', 'name.surname@college.ac.in', 'x+y@gmail.com'])('accepts %s', (e) => {
    expect(isPlausibleEmail(e)).toBe(true);
  });
  it.each(['', 'a@b', 'a b@c.com', 'vaishalimare@gmail.com.com'])('rejects %s', (e) => {
    expect(isPlausibleEmail(e)).toBe(false);
  });
});
