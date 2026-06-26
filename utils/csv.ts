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
  // True only at the very start of a field (before any character is consumed).
  // A `"` is treated as an opening quote ONLY here — a quote appearing
  // mid-field (e.g. O"Brien from a sloppy export) is a literal character, not
  // a quote toggle. This keeps one stray quote from swallowing the rest of the
  // row's commas and newlines.
  let fieldStart = true;

  const pushField = () => { record.push(field); field = ''; fieldStart = true; };
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
    if (ch === '"' && fieldStart) { inQuotes = true; fieldStart = false; continue; }
    if (ch === ',') { pushField(); continue; }
    if (ch === '\r') { continue; } // handled by the \n
    if (ch === '\n') { pushRecord(); continue; }
    field += ch;
    fieldStart = false;
  }
  // Flush the trailing field/record if the file doesn't end in a newline.
  if (field.length > 0 || record.length > 0) pushRecord();

  // Drop fully-blank records (e.g. trailing newline produced an empty record).
  const nonEmpty = records.filter(r => r.some(c => c.trim() !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };

  // De-duplicate header names so two columns sharing a label (e.g. a CSV with
  // two "Email" columns) don't silently collide when kept as extra fields or
  // keyed into a placeholder map. Repeats get a numeric suffix.
  const seenHeaders = new Map<string, number>();
  const headers = nonEmpty[0].map((h, i) => {
    const base = h.trim() || `column_${i + 1}`;
    const count = seenHeaders.get(base) ?? 0;
    seenHeaders.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
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
