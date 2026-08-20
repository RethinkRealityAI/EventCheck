import { describe, it, expect } from 'vitest';
import {
  planRetry,
  groupFailuresByRecipient,
  failureKindLabel,
  retryLikelyToFailAgain,
  type EmailFailureRecord,
} from '../utils/emailFailures';

const ORIGIN = 'https://gansid.netlify.app';

const rec = (over: Partial<EmailFailureRecord> = {}): EmailFailureRecord => ({
  id: 'f1',
  occurredAt: '2026-08-19T05:00:00.000Z',
  mode: 'staff-claim-completed',
  templateKey: null,
  recipient: 'sameera.g@novartis.com',
  formId: 'gansid-congress-2026',
  attendeeId: 'att-1',
  kind: 'quota',
  message: '550 You have reached your daily email sending quota.',
  subject: 'Your registration is confirmed',
  resolvedAt: null,
  ...over,
});

describe('planRetry', () => {
  it('rebuilds ticket modes from the attendee id alone', () => {
    for (const mode of [
      'guest-claim-completed', 'staff-claim-completed', 'exhibitor-staff-claim-completed',
      'staff-invite', 'exhibitor-staff-invite', 'bogo-ticket', 'bogo-ticket-updated',
    ]) {
      const plan = planRetry(rec({ mode }), ORIGIN);
      expect(plan.kind, mode).toBe('auto');
      if (plan.kind === 'auto') {
        expect(plan.body.attendeeId).toBe('att-1');
        expect(plan.body.origin).toBe(ORIGIN);
      }
    }
  });

  it('uses primaryAttendeeId for registration-confirmed, which takes a different key', () => {
    // Sending attendeeId there would 404 "Primary not found" — the retry would
    // look like it worked and quietly do nothing.
    const plan = planRetry(rec({ mode: 'registration-confirmed' }), ORIGIN);
    expect(plan.kind).toBe('auto');
    if (plan.kind === 'auto') {
      expect(plan.body.primaryAttendeeId).toBe('att-1');
      expect(plan.body.attendeeId).toBeUndefined();
    }
  });

  it('passes an explicit recipient for staff-claim-completed', () => {
    const plan = planRetry(rec({ mode: 'staff-claim-completed' }), ORIGIN);
    if (plan.kind === 'auto') expect(plan.body.to).toBe('sameera.g@novartis.com');
  });

  it('sends raw-html to the composer instead of offering a button that cannot work', () => {
    // We deliberately never store message bodies, so a one-off admin message
    // cannot be replayed from the record. Saying so beats a retry that fails.
    const plan = planRetry(rec({ mode: 'raw-html' }), ORIGIN);
    expect(plan.kind).toBe('compose');
    if (plan.kind === 'compose') expect(plan.reason).toMatch(/composer/i);
  });

  it('refuses when no attendee is linked', () => {
    const plan = planRetry(rec({ attendeeId: null }), ORIGIN);
    expect(plan.kind).toBe('impossible');
  });

  it('refuses an unknown mode rather than guessing a payload', () => {
    const plan = planRetry(rec({ mode: 'some-future-mode' }), ORIGIN);
    expect(plan.kind).toBe('impossible');
    if (plan.kind === 'impossible') expect(plan.reason).toContain('some-future-mode');
  });

  it('refuses when the mode was never recorded', () => {
    expect(planRetry(rec({ mode: null }), ORIGIN).kind).toBe('impossible');
  });
});

describe('groupFailuresByRecipient', () => {
  it('collapses a provider outage into one row per person', () => {
    // The incident wrote one row per recipient across a single run; ungrouped,
    // that is 78 near-identical lines an admin has to read.
    const rows = [
      rec({ id: 'a', recipient: 'one@x.co', occurredAt: '2026-08-19T05:00:00Z' }),
      rec({ id: 'b', recipient: 'two@x.co', occurredAt: '2026-08-19T05:01:00Z' }),
      rec({ id: 'c', recipient: 'one@x.co', occurredAt: '2026-08-19T05:02:00Z' }),
    ];
    const groups = groupFailuresByRecipient(rows, ORIGIN);
    expect(groups).toHaveLength(2);
    const one = groups.find(g => g.recipient === 'one@x.co')!;
    expect(one.count).toBe(2);
    // Latest first within a person, so the summary line is the current state.
    expect(one.latest.id).toBe('c');
  });

  it('sorts people by most recent failure', () => {
    const groups = groupFailuresByRecipient([
      rec({ id: 'a', recipient: 'old@x.co', occurredAt: '2026-08-19T01:00:00Z' }),
      rec({ id: 'b', recipient: 'new@x.co', occurredAt: '2026-08-19T09:00:00Z' }),
    ], ORIGIN);
    expect(groups[0].recipient).toBe('new@x.co');
  });

  it('treats addresses case-insensitively', () => {
    const groups = groupFailuresByRecipient([
      rec({ id: 'a', recipient: 'Sameera.G@Novartis.com' }),
      rec({ id: 'b', recipient: 'sameera.g@novartis.com' }),
    ], ORIGIN);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it('marks a group retryable when any of its failures can be replayed', () => {
    const groups = groupFailuresByRecipient([
      rec({ id: 'a', recipient: 'x@y.co', mode: 'raw-html' }),
      rec({ id: 'b', recipient: 'x@y.co', mode: 'bogo-ticket' }),
    ], ORIGIN);
    expect(groups[0].anyRetryable).toBe(true);
  });

  it('marks a group NOT retryable when nothing in it can be replayed', () => {
    const groups = groupFailuresByRecipient([
      rec({ id: 'a', recipient: 'x@y.co', mode: 'raw-html' }),
    ], ORIGIN);
    expect(groups[0].anyRetryable).toBe(false);
  });

  it('does not drop a failure recorded without an address', () => {
    const groups = groupFailuresByRecipient([rec({ recipient: null })], ORIGIN);
    expect(groups).toHaveLength(1);
    expect(groups[0].recipient).toBe('(no address recorded)');
  });

  it('returns nothing for an empty table', () => {
    expect(groupFailuresByRecipient([], ORIGIN)).toEqual([]);
  });
});

describe('failure presentation', () => {
  it('labels each kind in words an admin can act on', () => {
    expect(failureKindLabel('quota')).toBe('Provider limit');
    expect(failureKindLabel('recipient')).toBe('Bad address');
    expect(failureKindLabel('auth')).toBe('Credentials');
    expect(failureKindLabel(null)).toBe('Failed');
  });

  it('warns that account-wide failures will just fail again', () => {
    expect(retryLikelyToFailAgain('quota')).toBe(true);
    expect(retryLikelyToFailAgain('auth')).toBe(true);
    // A bad address or a blip is worth one retry.
    expect(retryLikelyToFailAgain('recipient')).toBe(false);
    expect(retryLikelyToFailAgain('connection')).toBe(false);
  });
});
