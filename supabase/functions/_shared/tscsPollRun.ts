// Pure helpers for the TSCS poller's run log (tscs_poll_runs).
//
// Extracted from the edge function so the tallies — the numbers an admin reads
// on the dashboard health banner to decide whether the pipeline is healthy —
// are unit-testable without Deno or IMAP. Miscounting here is silent and
// misleading in exactly the way observability must never be.

export type PollOutcomeStatus = 'ingested' | 'needs-review' | 'duplicate' | 'error' | 'ignored';

export interface PollOutcome {
  status?: string;
}

export interface PollTallies {
  processed: number;
  ingested: number;
  needs_review: number;
  duplicates: number;
  ignored: number;
  errors: number;
}

/** Count each message outcome of one poll into the run-log columns. Unknown or
 *  missing statuses still count toward `processed` (the message WAS seen) but
 *  land in no bucket — better an unexplained gap than a wrong bucket. */
export function tallyPollOutcomes(results: readonly PollOutcome[]): PollTallies {
  const t: PollTallies = {
    processed: results.length,
    ingested: 0,
    needs_review: 0,
    duplicates: 0,
    ignored: 0,
    errors: 0,
  };
  for (const r of results) {
    switch (r?.status) {
      case 'ingested': t.ingested++; break;
      case 'needs-review': t.needs_review++; break;
      case 'duplicate': t.duplicates++; break;
      case 'ignored': t.ignored++; break;
      case 'error': t.errors++; break;
      default: break;
    }
  }
  return t;
}

/** The row shape inserted into tscs_poll_runs for one attempt. */
export function buildPollRunRow(args: {
  startedAt: string;
  finishedAt?: string;
  dryRun: boolean;
  source: string;
  triggeredBy?: string | null;
  results: readonly PollOutcome[];
  ok: boolean;
  error?: string | null;
}): Record<string, unknown> {
  return {
    started_at: args.startedAt,
    finished_at: args.finishedAt ?? new Date().toISOString(),
    ok: args.ok,
    dry_run: args.dryRun,
    source: args.source,
    triggered_by: args.triggeredBy ?? null,
    // Errors are surfaced verbatim in the dashboard banner; cap so a huge
    // stack trace can't bloat every row.
    error: args.error ? String(args.error).slice(0, 2000) : null,
    ...tallyPollOutcomes(args.results),
  };
}
