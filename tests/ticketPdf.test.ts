import { describe, it, expect } from 'vitest';
import {
  readPngSize,
  fitWithin,
  ticketFromAttendeeRow,
  bytesToBase64,
  ticketPdfFilename,
  formatTicketDate,
} from '../supabase/functions/_shared/ticketPdf';

/** Build a data: URL whose PNG header declares the given dimensions. */
function pngDataUrl(w: number, h: number): string {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0); // signature
  bytes.set([0, 0, 0, 13], 8); // IHDR length
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // 'IHDR'
  const be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  bytes.set(be(w), 16);
  bytes.set(be(h), 20);
  return 'data:image/png;base64,' + bytesToBase64(bytes);
}

describe('readPngSize', () => {
  it('reads dimensions from a PNG data URL', () => {
    // The real GANSID congress wordmark is 1200x400.
    expect(readPngSize(pngDataUrl(1200, 400))).toEqual({ w: 1200, h: 400 });
    expect(readPngSize(pngDataUrl(1, 1))).toEqual({ w: 1, h: 1 });
  });

  it('handles dimensions above the signed-32-bit boundary without going negative', () => {
    expect(readPngSize(pngDataUrl(3000000000, 10))).toEqual({ w: 3000000000, h: 10 });
  });

  it('returns null for non-PNG, malformed, or missing input', () => {
    expect(readPngSize(undefined)).toBeNull();
    expect(readPngSize('')).toBeNull();
    expect(readPngSize('data:image/jpeg;base64,AAAA')).toBeNull();
    expect(readPngSize('https://x.co/a.png')).toBeNull();
    expect(readPngSize('data:image/png;base64,!!!not-base64!!!')).toBeNull();
  });

  it('returns null when the signature is wrong even if the mime claims PNG', () => {
    const fake = 'data:image/png;base64,' + bytesToBase64(new Uint8Array(24));
    expect(readPngSize(fake)).toBeNull();
  });
});

describe('fitWithin', () => {
  it('scales a wide wordmark to the width bound, preserving aspect', () => {
    // 3:1 into a 58x22 box is width-bound: 58 wide, 19.33 tall — NOT 25x25,
    // which is what squashed the logo before.
    const out = fitWithin(1200, 400, 58, 22);
    expect(out.w).toBeCloseTo(58, 5);
    expect(out.h).toBeCloseTo(58 / 3, 5);
    expect(out.w / out.h).toBeCloseTo(3, 5);
  });

  it('scales a tall image to the height bound', () => {
    const out = fitWithin(400, 1200, 58, 22);
    expect(out.h).toBeCloseTo(22, 5);
    expect(out.w).toBeCloseTo(22 / 3, 5);
  });

  it('never upscales past the box', () => {
    const out = fitWithin(10, 10, 58, 22);
    expect(out.w).toBeLessThanOrEqual(58);
    expect(out.h).toBeLessThanOrEqual(22);
  });

  it('falls back to the full box on degenerate input', () => {
    expect(fitWithin(0, 100, 58, 22)).toEqual({ w: 58, h: 22 });
    expect(fitWithin(100, 0, 58, 22)).toEqual({ w: 58, h: 22 });
  });
});

describe('ticketFromAttendeeRow', () => {
  const row = {
    id: 'abc-123',
    name: 'Sameera G',
    ticket_type: 'Hall Only',
    qr_payload: '{"id":"abc-123"}',
    registered_at: '2026-08-11T21:12:03.557Z',
    transaction_id: 'TX1',
    payment_amount: '0.00 USD',
    is_primary: false,
    guest_type: null,
    donated_seats: null,
    donated_tables: null,
    donation_type: null,
    answers: { f_fname: 'Sameera' },
  };

  it('maps snake_case columns onto the camelCase ticket shape', () => {
    const t = ticketFromAttendeeRow(row, 'GANSID Congress 2026');
    expect(t).toMatchObject({
      id: 'abc-123',
      name: 'Sameera G',
      ticketType: 'Hall Only',
      qrPayload: '{"id":"abc-123"}',
      registeredAt: '2026-08-11T21:12:03.557Z',
      transactionId: 'TX1',
      paymentAmount: '0.00 USD',
      isPrimary: false,
      formTitle: 'GANSID Congress 2026',
    });
    expect(t.answers).toEqual({ f_fname: 'Sameera' });
  });

  it('synthesises a scannable payload when qr_payload is null', () => {
    // The scanner resolves by id, so a null column must not yield an empty QR.
    const t = ticketFromAttendeeRow({ ...row, qr_payload: null });
    expect(JSON.parse(t.qrPayload)).toEqual({ id: 'abc-123' });
  });

  it('never leaves registeredAt undefined', () => {
    const t = ticketFromAttendeeRow({ ...row, registered_at: null });
    expect(typeof t.registeredAt).toBe('string');
    expect(Number.isNaN(Date.parse(t.registeredAt))).toBe(false);
  });
});

describe('bytesToBase64', () => {
  it('round-trips through atob', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 65, 66]);
    const decoded = atob(bytesToBase64(bytes));
    expect([...decoded].map(c => c.charCodeAt(0))).toEqual([...bytes]);
  });

  it('handles a payload larger than the chunk size without blowing the stack', () => {
    // A real ticket PDF with an embedded logo is well past 0x8000 bytes, which
    // is exactly where String.fromCharCode(...bytes) dies.
    const big = new Uint8Array(200_000).map((_, i) => i % 256);
    const out = bytesToBase64(big);
    expect(out.length).toBeGreaterThan(200_000);
    expect(atob(out).length).toBe(200_000);
  });

  it('encodes empty input as empty', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('');
  });
});

describe('ticketPdfFilename', () => {
  it('makes a readable, filesystem-safe name', () => {
    expect(ticketPdfFilename('Sameera G')).toBe('Sameera_G_Ticket.pdf');
    expect(ticketPdfFilename('Ashok Varma Kalidindi ')).toBe('Ashok_Varma_Kalidindi_Ticket.pdf');
  });

  it('strips punctuation without leaving stray underscores', () => {
    expect(ticketPdfFilename('Dr. Jane O’Brien-Smith')).toBe('Dr_Jane_O_Brien_Smith_Ticket.pdf');
  });

  it('falls back when the name is empty or unusable', () => {
    expect(ticketPdfFilename('')).toBe('Attendee_Ticket.pdf');
    expect(ticketPdfFilename('!!!')).toBe('Attendee_Ticket.pdf');
  });
});

describe('formatTicketDate', () => {
  it('formats an ISO timestamp as a long date', () => {
    expect(formatTicketDate('2026-08-11T21:12:03.557Z')).toMatch(/2026/);
  });

  it('returns the input unchanged when it cannot be parsed', () => {
    expect(formatTicketDate('not-a-date')).toBe('not-a-date');
  });
});
