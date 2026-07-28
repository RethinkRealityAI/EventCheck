import { describe, it, expect } from 'vitest';
import {
  classifyPortalUser,
  isCompletedPaymentStatus,
  isPendingPaymentStatus,
  matchesPortalUserFilter,
  type PortalUserFilterKey,
} from '../utils/portalUserStatus';

const DRAFT = { formId: 'f1', currentIndex: 1 };

describe('payment status predicates', () => {
  it('treats paid AND free as completed registrations', () => {
    expect(isCompletedPaymentStatus('paid')).toBe(true);
    expect(isCompletedPaymentStatus('free')).toBe(true);
  });

  it('does not treat pending as completed', () => {
    expect(isCompletedPaymentStatus('pending')).toBe(false);
    expect(isPendingPaymentStatus('pending')).toBe(true);
  });

  it('is safe on null/undefined legacy rows', () => {
    expect(isCompletedPaymentStatus(null)).toBe(false);
    expect(isCompletedPaymentStatus(undefined)).toBe(false);
    expect(isPendingPaymentStatus(null)).toBe(false);
  });
});

describe('classifyPortalUser', () => {
  it('counts a free registration as registered — the reported bug', () => {
    // A comped/invited/BOGO registrant has ticketCount > 0 from a 'free' row.
    expect(classifyPortalUser({ ticketCount: 1 })).toBe('registered');
  });

  it('stays registered even with a leftover draft from another form', () => {
    expect(classifyPortalUser({ ticketCount: 1, draft: DRAFT })).toBe('registered');
  });

  it('is in progress with a draft and no ticket', () => {
    expect(classifyPortalUser({ ticketCount: 0, draft: DRAFT })).toBe('in_progress');
  });

  it('is in progress with an unfinished payment and no draft', () => {
    expect(classifyPortalUser({ ticketCount: 0, hasPendingPayment: true })).toBe('in_progress');
  });

  it('is not started only when there is genuinely nothing', () => {
    expect(classifyPortalUser({ ticketCount: 0 })).toBe('not_started');
    expect(classifyPortalUser({ ticketCount: 0, draft: null, hasPendingPayment: false }))
      .toBe('not_started');
  });
});

describe('matchesPortalUserFilter', () => {
  const registered = { ticketCount: 2 };
  const inProgress = { ticketCount: 0, draft: DRAFT };
  const pendingPay = { ticketCount: 0, hasPendingPayment: true };
  const notStarted = { ticketCount: 0 };

  it('all shows everyone', () => {
    for (const u of [registered, inProgress, pendingPay, notStarted]) {
      expect(matchesPortalUserFilter(u, 'all')).toBe(true);
    }
  });

  it('never shows a registered user under not_started', () => {
    expect(matchesPortalUserFilter(registered, 'not_started')).toBe(false);
    expect(matchesPortalUserFilter(registered, 'in_progress')).toBe(false);
    expect(matchesPortalUserFilter(registered, 'has_ticket')).toBe(true);
  });

  it('never shows an in-progress user under not_started', () => {
    expect(matchesPortalUserFilter(inProgress, 'not_started')).toBe(false);
    expect(matchesPortalUserFilter(pendingPay, 'not_started')).toBe(false);
    expect(matchesPortalUserFilter(inProgress, 'in_progress')).toBe(true);
    expect(matchesPortalUserFilter(pendingPay, 'in_progress')).toBe(true);
  });

  it('puts a genuinely-untouched user in exactly one bucket', () => {
    const buckets: PortalUserFilterKey[] = ['not_started', 'in_progress', 'has_ticket'];
    const hits = buckets.filter(b => matchesPortalUserFilter(notStarted, b));
    expect(hits).toEqual(['not_started']);
  });

  it('assigns every user to exactly one bucket — no gaps, no overlaps', () => {
    const users = [registered, inProgress, pendingPay, notStarted];
    const buckets: PortalUserFilterKey[] = ['not_started', 'in_progress', 'has_ticket'];
    for (const u of users) {
      expect(buckets.filter(b => matchesPortalUserFilter(u, b))).toHaveLength(1);
    }
  });
});
