import { describe, it, expect } from 'vitest';
import { parseCsv, isValidEmail } from '../utils/csv';

describe('parseCsv', () => {
  it('parses a simple header + rows', () => {
    const { headers, rows } = parseCsv('Name,Email\nJane Doe,jane@example.com\nJohn,john@example.com');
    expect(headers).toEqual(['Name', 'Email']);
    expect(rows).toEqual([
      ['Jane Doe', 'jane@example.com'],
      ['John', 'john@example.com'],
    ]);
  });

  it('handles quoted fields with embedded commas and newlines', () => {
    const csv = 'Name,Note\n"Doe, Jane","line one\nline two"';
    const { rows } = parseCsv(csv);
    expect(rows[0]).toEqual(['Doe, Jane', 'line one\nline two']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const { rows } = parseCsv('Name\n"She said ""hi"""');
    expect(rows[0]).toEqual(['She said "hi"']);
  });

  it('treats a stray mid-field quote as a literal character', () => {
    // O"Brien is not a quoted field — the quote must not swallow the comma.
    const { rows } = parseCsv('Name,Email\nO"Brien,obrien@example.com');
    expect(rows[0]).toEqual(['O"Brien', 'obrien@example.com']);
  });

  it('strips a UTF-8 BOM from the first header', () => {
    const { headers } = parseCsv('﻿Name,Email\na,b@c.com');
    expect(headers[0]).toBe('Name');
  });

  it('pads and truncates ragged rows to the header width', () => {
    const { rows } = parseCsv('A,B,C\n1,2\n1,2,3,4');
    expect(rows[0]).toEqual(['1', '2', '']);
    expect(rows[1]).toEqual(['1', '2', '3']);
  });

  it('de-duplicates repeated header names with a numeric suffix', () => {
    const { headers } = parseCsv('Email,Email,Name\na@b.com,c@d.com,x');
    expect(headers).toEqual(['Email', 'Email_2', 'Name']);
  });

  it('handles CRLF line endings and a trailing newline', () => {
    const { headers, rows } = parseCsv('Name,Email\r\nJane,jane@x.com\r\n');
    expect(headers).toEqual(['Name', 'Email']);
    expect(rows).toEqual([['Jane', 'jane@x.com']]);
  });

  it('returns empty for blank input', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
    expect(parseCsv('   \n  ')).toEqual({ headers: [], rows: [] });
  });
});

describe('isValidEmail', () => {
  it('accepts well-formed addresses', () => {
    expect(isValidEmail('jane@example.com')).toBe(true);
    expect(isValidEmail('  jane.doe+tag@sub.example.co.uk ')).toBe(true);
  });
  it('rejects malformed or empty addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
    expect(isValidEmail('a @b.com')).toBe(false);
  });
});
