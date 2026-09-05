// Does a hand-written email body promise something the send cannot deliver?
//
// The ticket modes have three independent safeguards against an email that
// says "your ticket is here" and carries nothing:
//
//   * `ensureTicketBlocks` appends the QR block and the download button when
//     the copy omits them, so an edited template cannot drop the ticket.
//   * `attachmentNoteFor(hasPdf)` writes the "your ticket is attached" line
//     only once the attachment really exists.
//   * `stripDeadLinks` degrades an <a> whose href resolved to empty into plain
//     text, so an unresolved link is never a button that goes nowhere.
//
// All three work on markup the function itself builds. None of them can look
// inside a sentence the CALLER wrote. When `bodyOverride` arrived, a one-off
// send could state "your full ticket is attached to this email as a PDF" in its
// own prose while `buildTicketPdfAttachment` had quietly returned null — it
// catches its own errors by design — and the guarantee was gone. That is the
// August 2026 failure with a new way in: a recipient told they hold a ticket
// they do not have finds out at the door.
//
// So the caller's prose is checked against what the send actually carries, and
// a body making a claim the facts do not support is discarded in favour of the
// configured template, which the three safeguards above still police.
//
// Only attachment claims are checked here. The QR and the download link need no
// equivalent: whatever the caller writes, `ensureTicketBlocks` supplies what is
// missing and `stripDeadLinks` removes what cannot work.

/** What the send is genuinely carrying, established before the copy is chosen. */
export interface TicketClaimFacts {
  /** True when at least one PDF is really attached to this message. */
  hasPdfAttachment: boolean;
}

/** Words that name the thing a recipient needs at the door. */
const DOCUMENT = String.raw`(?:ticket|pdf|pass|badge)`;
/** "attach", "attached", "attachment", "attachments". */
const ATTACH = String.raw`attach(?:ed|ment|ments)?`;

// The two words have to sit near each other, in either order, without a
// sentence ending between them: "your ticket is attached as a PDF" and "please
// find attached your badge" both count, while "this person has a free guest
// attached" does not — nothing near it names a document.
const ATTACHMENT_CLAIM = new RegExp(
  String.raw`\b${ATTACH}\b[^.!?]{0,80}?\b${DOCUMENT}\b` +
  String.raw`|\b${DOCUMENT}\b[^.!?]{0,80}?\b${ATTACH}\b`,
  'i',
);

/** Tags out, entities left alone — the claim is in the words, not the markup. */
function toPlainText(html: string): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Claims this body makes that the send cannot back, in plain language fit for
 * a log line or an API response. Empty means the copy is safe to use.
 *
 * A false positive here costs a fallback to the configured template and a log
 * line; a false negative costs a registrant their ticket. The matching is
 * deliberately biased that way — copy that says a ticket is NOT attached reads
 * the same to this regex as copy that says it is, and losing the override is
 * the acceptable outcome.
 */
export function findUnbackedClaims(bodyHtml: string, facts: TicketClaimFacts): string[] {
  const problems: string[] = [];
  if (!facts.hasPdfAttachment && ATTACHMENT_CLAIM.test(toPlainText(bodyHtml))) {
    problems.push(
      'body claims a ticket is attached, but no PDF was built for this send',
    );
  }
  return problems;
}

/**
 * The body to actually send: the caller's, or nothing when theirs would lie.
 *
 * Returning `undefined` hands the decision back to `resolveEmailTemplate`,
 * which falls through to the per-form override, the global template, and
 * finally the hardcoded default — every one of them policed by
 * `ensureTicketBlocks`. There is no path here that sends an unchecked claim.
 */
export function safeCallerBody(
  bodyOverride: unknown,
  facts: TicketClaimFacts,
): { body: string | undefined; rejected: string[] } {
  if (typeof bodyOverride !== 'string' || bodyOverride.trim() === '') {
    return { body: undefined, rejected: [] };
  }
  const rejected = findUnbackedClaims(bodyOverride, facts);
  return { body: rejected.length ? undefined : bodyOverride, rejected };
}
