// Minimal, dependency-free CSV parser for the bulk-contact import flow.
//
// Handles the cases real-world exports throw at us: quoted fields, escaped
// double-quotes ("" inside a quoted field), commas and newlines inside quotes,
// and both \r\n and \n line endings. It is deliberately small — we only need
// to read a contact list, not implement the full RFC 4180 surface.

export interface ParsedCsv {
  /** Header row, trimmed. Empty strings are kept so column indices stay aligned. */
  headers: string[];
  /** Data rows. Each row is padded/truncated to `headers.length` columns. */
  rows: string[][];
}

/**
 * Parse a CSV string into headers + rows. The first non-empty record is taken
 * as the header row. Returns empty arrays for blank input.
 */
export function parseCsv(input: string): ParsedCsv {
  const text = (input ?? '').replace(/^﻿/, ''); // strip BOM
  if (!text.trim()) return { headers: [], rows: [] };

  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;

  const pushField = () => { record.push(field); field = ''; };
  const pushRecord = () => { pushField(); records.push(record); record = []; };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { pushField(); continue; }
    if (ch === '\r') { continue; } // handled by the \n
    if (ch === '\n') { pushRecord(); continue; }
    field += ch;
  }
  // Flush the trailing field/record if the file doesn't end in a newline.
  if (field.length > 0 || record.length > 0) pushRecord();

  // Drop fully-blank records (e.g. trailing newline produced an empty record).
  const nonEmpty = records.filter(r => r.some(c => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  const headers = nonEmpty[0].map(h => h.trim());
  const width = headers.length;
  const rows = nonEmpty.slice(1).map(r => {
    const padded = r.slice(0, width);
    while (padded.length < width) padded.push('');
    return padded;
  });
  return { headers, rows };
}

/** Loose email validation — good enough to flag obviously-broken rows. */
export function isValidEmail(value: string): boolean {
  const v = (value ?? '').trim();
  if (!v) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}
