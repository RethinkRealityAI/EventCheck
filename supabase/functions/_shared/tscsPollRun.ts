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

/** What the poller should do with one message, and why. */
export type MessageDisposition =
  | { action: 'ingest' }
  | { action: 'ignored'; reason: string }
  | { action: 'needs-review'; reason: string };

/**
 * Decide one message's fate from what the parser and the payment gate found.
 *
 * Pure on purpose. Every bug this pipeline has shipped has lived in exactly
 * this decision — a pending notice read as a confirmation, a confirmation with
 * no transaction id registered on the strength of a subject line — and none of
 * them were reachable by a test while the logic sat inline in an IMAP loop.
 *
 * The invariant it exists to hold: nothing auto-registers without positive,
 * checkable proof of payment. Ambiguity always routes to a human; it never
 * defaults to handing out a congress ticket.
 */
export function classifyTscsMessage(args: {
  parseOk: boolean;
  parseReason?: string;
  paymentState: 'pending' | 'confirmed' | 'unknown';
  paymentId?: string;
}): MessageDisposition {
  if (!args.parseOk) {
    return { action: 'needs-review', reason: args.parseReason || 'could not parse this message' };
  }
  // TSCS mails a "[PENDING] Incomplete Registration" notice for abandoned
  // checkouts that is structurally identical to a real confirmation. Filed,
  // not ingested — and not alerted on, because an abandoned checkout is a
  // non-event rather than a problem.
  if (args.paymentState === 'pending') {
    return { action: 'ignored', reason: 'TSCS pending notice — checkout was not completed, nothing to register' };
  }
  if (args.paymentState === 'unknown') {
    return {
      action: 'needs-review',
      reason: 'no transaction id and no payment-confirmed marker — do not register without checking with TSCS',
    };
  }
  // Confirmed by a [PAID]/[SUCCESS]/PAYMENT CONFIRMED marker, but with no
  // Razorpay id to back it up. A marker is a claim; the payment id is the
  // receipt. Registering on the claim alone is what put two unpaid rows in
  // the attendee list, so this waits for a person.
  if (!args.paymentId) {
    return {
      action: 'needs-review',
      reason: 'marked paid but carries no Razorpay transaction id — confirm the payment with TSCS before registering',
    };
  }
  return { action: 'ingest' };
}
