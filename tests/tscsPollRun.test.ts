import { describe, it, expect } from 'vitest';
import { tallyPollOutcomes, buildPollRunRow } from '../supabase/functions/_shared/tscsPollRun';

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
