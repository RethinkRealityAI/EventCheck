import { describe, it, expect } from 'vitest';
import { findUnbackedClaims, safeCallerBody } from '../supabase/functions/_shared/ticketClaims';

// These tests exist because of a near miss on 2026-09-04. A one-off send to a
// sponsor's delegation used the then-new `bodyOverride` and hardcoded the
// sentence "Your full ticket is attached to this email as a PDF" into its own
// copy. `buildTicketPdfAttachment` catches its own errors and returns null, so
// that sentence was a promise the send could not keep — and because the copy
// came from the caller, neither `attachmentNoteFor` nor `ensureTicketBlocks`
// could correct it. It was caught by reading the code before sending, which is
// not a control. This is the control.
//
// If you are an agent adding copy to a ticket email: do not write the words
// "attached" and "ticket"/"PDF" into a body you pass to the function. Let
// `attachmentNoteFor(hasPdf)` say it, because only it knows.

const WITH_PDF = { hasPdfAttachment: true };
const NO_PDF = { hasPdfAttachment: false };

describe('findUnbackedClaims', () => {
  it('catches the exact sentence that nearly shipped', () => {
    const body = '<p style="color:#666">Your full ticket is attached to this '
      + 'email as a PDF — print it or show it on your phone.</p>';
    expect(findUnbackedClaims(body, NO_PDF)).toHaveLength(1);
    expect(findUnbackedClaims(body, NO_PDF)[0]).toMatch(/attached/i);
  });

  it('allows that same sentence once the PDF is really there', () => {
    const body = '<p>Your full ticket is attached to this email as a PDF.</p>';
    expect(findUnbackedClaims(body, WITH_PDF)).toEqual([]);
  });

  it('sees through the markup between the words', () => {
    // The claim is in the prose, not the tags — a <strong> or a line break
    // between "ticket" and "attached" must not hide it.
    const body = '<p>Your <strong>ticket</strong><br/> is\n  <em>attached</em>.</p>';
    expect(findUnbackedClaims(body, NO_PDF)).toHaveLength(1);
  });

  it('catches the claim in either word order', () => {
    expect(findUnbackedClaims('Please find attached your badge.', NO_PDF)).toHaveLength(1);
    expect(findUnbackedClaims('Your badge is attached.', NO_PDF)).toHaveLength(1);
    expect(findUnbackedClaims('The attachment is your pass.', NO_PDF)).toHaveLength(1);
  });

  it('does not fire on "attached" used about something else', () => {
    // storageService's remove-staff error says exactly this. Copy that happens
    // to reuse the word must not cost a sponsor their custom email.
    expect(findUnbackedClaims('This person has a free guest attached.', NO_PDF)).toEqual([]);
    expect(findUnbackedClaims('Reply with any dietary needs attached to your booking.', NO_PDF)).toEqual([]);
  });

  it('does not fire across a sentence boundary', () => {
    // Two unrelated sentences that merely both exist should not combine into a
    // claim, or every long email would be rejected.
    const body = 'Your pass is confirmed. Nothing else is needed. '
      + 'A colleague asked about the agenda, which we have attached for the team.';
    expect(findUnbackedClaims(body, NO_PDF)).toEqual([]);
  });

  it('says nothing about a body that makes no claim at all', () => {
    const body = '<p>Hi Roy,</p><p>You are registered on a Hall-Only pass.</p>';
    expect(findUnbackedClaims(body, NO_PDF)).toEqual([]);
    expect(findUnbackedClaims(body, WITH_PDF)).toEqual([]);
  });

  it('handles an empty or missing body without throwing', () => {
    expect(findUnbackedClaims('', NO_PDF)).toEqual([]);
    expect(findUnbackedClaims(undefined as any, NO_PDF)).toEqual([]);
  });
});

describe('safeCallerBody', () => {
  it('passes an honest body straight through', () => {
    const body = '<p>Your ticket is attached.</p>';
    expect(safeCallerBody(body, WITH_PDF)).toEqual({ body, rejected: [] });
  });

  it('withholds a dishonest body and reports why', () => {
    const r = safeCallerBody('<p>Your ticket is attached.</p>', NO_PDF);
    // undefined, not '' — resolveEmailTemplate must fall through to the
    // configured template rather than send a blank email.
    expect(r.body).toBeUndefined();
    expect(r.rejected).toHaveLength(1);
  });

  it('treats absent, blank and non-string overrides as "no override"', () => {
    // The edge function passes body.bodyOverride unconditionally, so the
    // everyday send arrives here with undefined and must not be reported as a
    // rejection — that would put a false error in the logs on every send.
    for (const v of [undefined, null, '', '   ', 42, {}]) {
      expect(safeCallerBody(v, NO_PDF)).toEqual({ body: undefined, rejected: [] });
    }
  });

  it('keeps a body that only promises what a bare QR email delivers', () => {
    const body = '<p>Have this QR code scanned at the door.</p>';
    expect(safeCallerBody(body, NO_PDF).body).toBe(body);
  });
});
