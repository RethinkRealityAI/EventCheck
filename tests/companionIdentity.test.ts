import { describe, it, expect } from 'vitest';
import {
  isPlaceholderEmail,
  pendingGuestName,
  placeholderEmailFor,
  readCompanionEmail,
  readCompanionName,
  resolveCompanionIdentity,
} from '../supabase/functions/_shared/companionIdentity';

describe('readCompanionName', () => {
  it('accepts an ordinary name', () => {
    expect(readCompanionName('Niharika Gali Mary')).toEqual({ name: 'Niharika Gali Mary', reason: 'ok' });
  });

  it('strips an honorific and collapses whitespace, like the parser does', () => {
    expect(readCompanionName('  Dr.   Vilas   Chavan ').name).toBe('Vilas Chavan');
  });

  it('rejects the live "- -" that put an unnamed attendee in the roster', () => {
    // REG-00061: TSCS's mail literally read "Free Addon Person / Name- -Email".
    expect(readCompanionName('- -')).toEqual({ name: null, reason: 'placeholder' });
  });

  it.each(['--', '.', '   ', '', '_ _', '?'])('rejects %j as having no letters', (v) => {
    expect(readCompanionName(v).name).toBeNull();
  });

  it('rejects the spellings that mean "I left this blank"', () => {
    for (const v of ['None None', 'N/A', 'n.a.', 'NIL', 'unknown', 'TBD']) {
      expect(readCompanionName(v).name, v).toBeNull();
    }
  });

  it('rejects one repeated letter but keeps a real two-letter name', () => {
    expect(readCompanionName('aaa').name).toBeNull();
    expect(readCompanionName('Li Wu').name).toBe('Li Wu');
  });

  it('keeps unfamiliar transliterations — a name nobody recognises is still a name', () => {
    // Being over-eager here keeps a paying registrant off the roster, which is
    // a worse error than letting one odd string reach a human's eye.
    expect(readCompanionName('sivanandan raju kadimela').name).toBe('sivanandan raju kadimela');
    expect(readCompanionName('Umme tul Rida').name).toBe('Umme tul Rida');
  });

  it('keeps names carrying accents', () => {
    expect(readCompanionName('Zoë Ali').name).toBe('Zoë Ali');
  });
});

describe('readCompanionEmail', () => {
  it('accepts and normalises a real address', () => {
    expect(readCompanionEmail('  Aishu.Tummala@Gmail.com ')).toEqual({
      email: 'aishu.tummala@gmail.com', reason: 'ok',
    });
  });

  it('rejects the doubled TLD that is valid, undeliverable, and quota-burning', () => {
    // REG-00058 stored this as if it were reachable.
    expect(readCompanionEmail('vaishalimare@gmail.com.com')).toEqual({
      email: null, reason: 'doubled-tld',
    });
  });

  it('leaves real public suffixes alone', () => {
    for (const v of ['a@b.co.in', 'a@b.com.au', 'a@b.co.uk', 'a@sub.co.jp']) {
      expect(readCompanionEmail(v).reason, v).toBe('ok');
    }
  });

  it('reports a blank field and a malformed one differently', () => {
    expect(readCompanionEmail('').reason).toBe('missing');
    expect(readCompanionEmail('not-an-email').reason).toBe('malformed');
  });

  it('treats the purchaser own address as "not theirs", case-insensitively', () => {
    // SATYENDRA SINGH arrived as THALASSAEMIAFREEMP@GMAIL.COM against a
    // lowercase purchaser address.
    expect(readCompanionEmail('THALASSAEMIAFREEMP@GMAIL.COM', 'thalassaemiafreemp@gmail.com')).toEqual({
      email: null, reason: 'same-as-purchaser',
    });
  });
});

describe('resolveCompanionIdentity', () => {
  it('keeps the raw input so an admin can repair a typo', () => {
    const id = resolveCompanionIdentity({ name: '- -', email: '' }, 'buyer@example.com');
    expect(id.name).toBeNull();
    expect(id.rawName).toBe('- -');
    expect(id.nameReason).toBe('placeholder');
    expect(id.emailReason).toBe('missing');
  });

  it('separates the two verdicts — a named person with no inbox is still named', () => {
    const id = resolveCompanionIdentity({ name: 'Atul Kulkarni', email: 'buyer@example.com' }, 'buyer@example.com');
    expect(id.name).toBe('Atul Kulkarni');
    expect(id.email).toBeNull();
    expect(id.emailReason).toBe('same-as-purchaser');
  });

  it('tolerates a missing addon block entirely', () => {
    const id = resolveCompanionIdentity(null, 'buyer@example.com');
    expect(id.name).toBeNull();
    expect(id.email).toBeNull();
  });
});

describe('placeholder addresses', () => {
  it('builds an address in the reserved .invalid TLD', () => {
    expect(placeholderEmailFor('abc-123')).toBe('guest-abc-123@placeholder.invalid');
  });

  it('recognises its own placeholders and nothing else', () => {
    expect(isPlaceholderEmail(placeholderEmailFor('x'))).toBe(true);
    expect(isPlaceholderEmail('GUEST-X@PLACEHOLDER.INVALID')).toBe(true);
    expect(isPlaceholderEmail('real@person.com')).toBe(false);
    expect(isPlaceholderEmail(null)).toBe(false);
  });
});

describe('pendingGuestName', () => {
  it('names the seat after its purchaser', () => {
    expect(pendingGuestName('Varun Trivedi')).toBe('Varun Trivedi - Guest (pending)');
  });

  it('never produces a leading separator when the purchaser has no name', () => {
    expect(pendingGuestName('')).toBe('Guest (pending)');
    expect(pendingGuestName(null)).toBe('Guest (pending)');
  });
});
