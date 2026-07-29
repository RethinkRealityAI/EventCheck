import { describe, it, expect } from 'vitest';
import { escapeLikePattern, emailIlikePattern, emailsMatch } from '../utils/emailMatch';

describe('escapeLikePattern', () => {
  it('escapes the SQL LIKE wildcards', () => {
    expect(escapeLikePattern('a%b')).toBe('a\\%b');
    expect(escapeLikePattern('first_last')).toBe('first\\_last');
  });

  it('escapes backslash FIRST so wildcard markers are not double-escaped', () => {
    // Naive ordering would turn `a\b` into `a\\\\b` after the later passes.
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    expect(escapeLikePattern('a\\_b')).toBe('a\\\\\\_b');
  });

  it("escapes `*` — PostgREST accepts it as an alias for `%`", () => {
    expect(escapeLikePattern('a*b')).toBe('a\\*b');
  });

  it('leaves ordinary email characters untouched', () => {
    expect(escapeLikePattern('sikha.singh+tag@aphl.org')).toBe('sikha.singh+tag@aphl.org');
  });

  it('handles nullish input', () => {
    expect(escapeLikePattern(undefined as any)).toBe('');
    expect(escapeLikePattern(null as any)).toBe('');
  });
});

describe('emailIlikePattern', () => {
  it('trims surrounding whitespace from form input', () => {
    expect(emailIlikePattern('  sikha.singh@aphl.org \n')).toBe('sikha.singh@aphl.org');
  });

  it('escapes an underscore so it cannot act as a single-char wildcard', () => {
    // Unescaped, `first_last@x.co` would ALSO match `firstXlast@x.co`.
    expect(emailIlikePattern('first_last@x.co')).toBe('first\\_last@x.co');
  });

  it('preserves case (ILIKE does the case folding, not the pattern)', () => {
    expect(emailIlikePattern('Sikha.Singh@APHL.org')).toBe('Sikha.Singh@APHL.org');
  });
});

describe('emailsMatch', () => {
  it('matches regardless of case and surrounding whitespace', () => {
    expect(emailsMatch('Sikha.Singh@APHL.org', ' sikha.singh@aphl.org ')).toBe(true);
  });

  it('does not match different addresses', () => {
    expect(emailsMatch('sikha.singh@aphl.org', 'jelili.ojodu@aphl.org')).toBe(false);
  });

  it('treats blank/nullish as never matching (two empties are not "the same person")', () => {
    expect(emailsMatch('', '')).toBe(false);
    expect(emailsMatch(null, undefined)).toBe(false);
    expect(emailsMatch('   ', '')).toBe(false);
    expect(emailsMatch('a@b.co', '')).toBe(false);
  });
});
