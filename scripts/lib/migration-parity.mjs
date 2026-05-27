/**
 * Pure helpers for migration / schema parity checks (SCAGO + GANSID).
 * Imported by scripts/check-migrations-parity.mjs and Vitest.
 */

import fs from 'node:fs';
import path from 'node:path';

export const TENANTS = [
  { name: 'SCAGO', projectRef: 'iigbgbgakevcgilucvbs' },
  { name: 'GANSID', projectRef: 'gticuvgclbvhwvpzkuez' },
];

const MIGRATION_ID_RE = /^(\d{14})_/;

/** @returns {string[]} sorted 14-digit version ids */
export function listLocalMigrationVersions(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .map(f => MIGRATION_ID_RE.exec(f)?.[1])
    .filter(Boolean)
    .sort();
}

/** @returns {Map<string, string>} version -> filename */
export function listLocalMigrationFiles(migrationsDir) {
  const map = new Map();
  if (!fs.existsSync(migrationsDir)) return map;
  for (const f of fs.readdirSync(migrationsDir)) {
    const id = MIGRATION_ID_RE.exec(f)?.[1];
    if (id) map.set(id, f);
  }
  return map;
}

/**
 * Build expected public-schema columns from local migration SQL.
 * Applies ADD COLUMN then subtracts DROP COLUMN (last write wins per column).
 *
 * @returns {Map<string, Set<string>>} table -> columns
 */
export function expectedColumnsFromMigrations(migrationsDir) {
  const add = new Map();
  const drop = new Map();

  const addRe =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?(\w+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi;
  const dropRe =
    /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?(\w+)\s+DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?(\w+)/gi;

  const files = listLocalMigrationFiles(migrationsDir);
  const ordered = [...files.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [, filename] of ordered) {
    const sql = fs.readFileSync(path.join(migrationsDir, filename), 'utf8');
    let m;
    while ((m = addRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase();
      const col = m[2].toLowerCase();
      if (!add.has(table)) add.set(table, new Set());
      add.get(table).add(col);
      if (drop.has(table)) drop.get(table).delete(col);
    }
    while ((m = dropRe.exec(sql)) !== null) {
      const table = m[1].toLowerCase();
      const col = m[2].toLowerCase();
      if (!drop.has(table)) drop.set(table, new Set());
      drop.get(table).add(col);
      if (add.has(table)) add.get(table).delete(col);
    }
  }

  return add;
}

/**
 * Columns the app reads/writes that must exist on BOTH tenants even if added
 * outside the repo migration history (SCAGO MCP drift). Keep in sync with
 * new attendee/form columns — see CLAUDE.md §15 check:migrations.
 */
export const REQUIRED_APP_COLUMNS = {
  attendees: [
    'attendee_category',
    'applied_promo_code',
    'is_bogo_claim',
    'bogo_source_attendee_id',
    'bogo_dismissed_by_payer_at',
    'is_donated_seat_claim',
    'is_paid_extra',
    'pricing_template_id',
    'pricing_tier',
    'pricing_bracket',
    'pricing_category_id',
  ],
};

/** Merge migration-derived + app-required columns. */
export function mergeExpectedColumns(fromMigrations) {
  const merged = new Map(fromMigrations);
  for (const [table, cols] of Object.entries(REQUIRED_APP_COLUMNS)) {
    if (!merged.has(table)) merged.set(table, new Set());
    for (const c of cols) merged.get(table).add(c);
  }
  return merged;
}

/**
 * @param {string[]} localVersions
 * @param {string[]} remoteVersions
 */
export function diffMigrationHistory(localVersions, remoteVersions) {
  const remote = new Set(remoteVersions);
  const local = new Set(localVersions);
  const missingOnRemote = localVersions.filter(v => !remote.has(v));
  const orphanOnRemote = remoteVersions.filter(v => !local.has(v));
  return { missingOnRemote, orphanOnRemote };
}

/**
 * @param {Map<string, Set<string>>} expected table -> columns
 * @param {Map<string, Set<string>>} actual table -> columns
 */
export function diffSchemaColumns(expected, actual) {
  const missing = [];
  for (const [table, cols] of expected) {
    const have = actual.get(table) ?? new Set();
    for (const col of cols) {
      if (!have.has(col)) missing.push({ table, column: col });
    }
  }
  return missing;
}

/** Parse `supabase db query -o json` stdout (may include CLI stderr noise). */
export function parseSupabaseJsonStdout(stdout) {
  const text = String(stdout);
  const start = text.indexOf('{');
  if (start < 0) throw new Error('No JSON object in supabase CLI output');
  return JSON.parse(text.slice(start));
}

export function rowsToVersionList(payload) {
  const rows = payload?.rows ?? [];
  return rows.map(r => String(r.version ?? r.VERSION ?? '')).filter(Boolean).sort();
}

export function rowsToColumnMap(payload) {
  const rows = payload?.rows ?? [];
  /** @type {Map<string, Set<string>>} */
  const map = new Map();
  for (const r of rows) {
    const table = String(r.table_name ?? r.TABLE_NAME ?? '').toLowerCase();
    const col = String(r.column_name ?? r.COLUMN_NAME ?? '').toLowerCase();
    if (!table || !col) continue;
    if (!map.has(table)) map.set(table, new Set());
    map.get(table).add(col);
  }
  return map;
}
