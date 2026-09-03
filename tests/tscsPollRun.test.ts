import { describe, it, expect } from 'vitest';
import { tallyPollOutcomes, buildPollRunRow, classifyTscsMessage } from '../supabase/functions/_shared/tscsPollRun';

describe('tallyPollOutcomes', () => {
  it('counts every outcome into its own bucket', () => {
    const t = tallyPollOutcomes([
      { status: 'ingested' }, { status: 'ingested' },
      { status: 'needs-review' },
      { status: 'duplicate' }, { status: 'duplicate' }, { status: 'duplicate' },
      { status: 'ignored' },
      { status: 'error' },
    ]);
    expect(t).toEqual({
      processed: 8, ingested: 2, needs_review: 1, duplicates: 3, ignored: 1, errors: 1,
    });
  });

  it('an empty healthy poll is all zeros — NOT indistinguishable from no poll', () => {
    // The run row still gets written; that is the entire point of the table.
    expect(tallyPollOutcomes([])).toEqual({
      processed: 0, ingested: 0, needs_review: 0, duplicates: 0, ignored: 0, errors: 0,
    });
  });

  it('unknown or missing statuses count as processed but land in no bucket', () => {
    const t = tallyPollOutcomes([{ status: 'wat' }, {}, { status: 'ingested' }]);
    expect(t.processed).toBe(3);
    expect(t.ingested).toBe(1);
    expect(t.needs_review + t.duplicates + t.ignored + t.errors).toBe(0);
  });
});

describe('buildPollRunRow', () => {
  const base = {
    startedAt: '2026-09-02T10:00:00.000Z',
    finishedAt: '2026-09-02T10:00:04.000Z',
    dryRun: false,
    source: 'cron',
    results: [{ status: 'ingested' }, { status: 'needs-review' }],
  };

  it('builds a complete row with tallies merged in', () => {
    const row = buildPollRunRow({ ...base, ok: true });
    expect(row).toMatchObject({
      started_at: '2026-09-02T10:00:00.000Z',
      finished_at: '2026-09-02T10:00:04.000Z',
      ok: true,
      dry_run: false,
      source: 'cron',
      triggered_by: null,
      error: null,
      processed: 2,
      ingested: 1,
      needs_review: 1,
    });
  });

  it('records who triggered a dashboard run', () => {
    const row = buildPollRunRow({ ...base, source: 'dashboard', triggeredBy: 'dapo@x.ai', ok: true });
    expect(row.source).toBe('dashboard');
    expect(row.triggered_by).toBe('dapo@x.ai');
  });

  it('caps runaway error text so one stack trace cannot bloat the table', () => {
    const row = buildPollRunRow({ ...base, ok: false, error: 'x'.repeat(5000) });
    expect(row.ok).toBe(false);
    expect(String(row.error)).toHaveLength(2000);
  });

  it('defaults finished_at to now when not supplied', () => {
    const row = buildPollRunRow({ ...base, finishedAt: undefined, ok: true });
    expect(typeof row.finished_at).toBe('string');
    expect(Number.isNaN(Date.parse(String(row.finished_at)))).toBe(false);
  });
});

describe('classifyTscsMessage — nothing registers without proof of payment', () => {
  const confirmed = { parseOk: true, paymentState: 'confirmed' as const, paymentId: 'pay_TXTbLRamVUH3bp' };

  it('ingests only a parsed, confirmed message carrying a Razorpay id', () => {
    expect(classifyTscsMessage(confirmed)).toEqual({ action: 'ingest' });
  });

  it('files a pending notice rather than registering it', () => {
    // The live failure: two "[PENDING] Incomplete Registration" mails for
    // abandoned checkouts, parsed perfectly, registered as paid, ticketed.
    const d = classifyTscsMessage({ parseOk: true, paymentState: 'pending' });
    expect(d.action).toBe('ignored');
    if (d.action === 'ignored') expect(d.reason).toMatch(/not completed/i);
  });

  it('files a pending notice even when it somehow carries a payment id', () => {
    expect(classifyTscsMessage({ ...confirmed, paymentState: 'pending' }).action).toBe('ignored');
  });

  it('queues a [PAID] mail that carries no transaction id', () => {
    // A subject marker is a claim; the payment id is the receipt. This is the
    // exact shape the old code registered on the strength of the claim alone.
    const d = classifyTscsMessage({ parseOk: true, paymentState: 'confirmed' });
    expect(d.action).toBe('needs-review');
    if (d.action === 'needs-review') expect(d.reason).toMatch(/no Razorpay transaction id/i);
  });

  it('queues an empty-string payment id the same way', () => {
    expect(classifyTscsMessage({ ...confirmed, paymentId: '' }).action).toBe('needs-review');
  });

  it('queues an unparseable message with the parser reason intact', () => {
    const d = classifyTscsMessage({ parseOk: false, parseReason: 'no Full Name label', paymentState: 'unknown' });
    expect(d.action).toBe('needs-review');
    if (d.action === 'needs-review') expect(d.reason).toBe('no Full Name label');
  });

  it('queues an unparseable message even when payment looks confirmed', () => {
    expect(classifyTscsMessage({ ...confirmed, parseOk: false }).action).toBe('needs-review');
  });

  it('queues an unknown payment state', () => {
    expect(classifyTscsMessage({ parseOk: true, paymentState: 'unknown' }).action).toBe('needs-review');
  });

  it('never returns ingest for anything but the one safe combination', () => {
    const states = ['pending', 'confirmed', 'unknown'] as const;
    for (const parseOk of [true, false]) {
      for (const paymentState of states) {
        for (const paymentId of [undefined, '', 'pay_X1']) {
          const d = classifyTscsMessage({ parseOk, paymentState, paymentId });
          const shouldIngest = parseOk && paymentState === 'confirmed' && paymentId === 'pay_X1';
          expect(d.action === 'ingest').toBe(shouldIngest);
        }
      }
    }
  });
});
