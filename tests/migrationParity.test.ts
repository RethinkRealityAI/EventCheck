import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  listLocalMigrationVersions,
  expectedColumnsFromMigrations,
  mergeExpectedColumns,
  diffMigrationHistory,
  diffSchemaColumns,
  REQUIRED_APP_COLUMNS,
  rowsToVersionList,
  rowsToColumnMap,
} from '../scripts/lib/migration-parity.mjs';

const MIGRATIONS_DIR = path.resolve(__dirname, '../supabase/migrations');

describe('migration parity helpers', () => {
  it('lists local migration version ids from filenames', () => {
    const versions = listLocalMigrationVersions(MIGRATIONS_DIR);
    expect(versions.length).toBeGreaterThan(10);
    expect(versions).toContain('20260527110000');
    expect(versions.every(v => /^\d{14}$/.test(v))).toBe(true);
  });

  it('extracts attendee_category from add_attendee_category migration', () => {
    const cols = expectedColumnsFromMigrations(MIGRATIONS_DIR);
    expect(cols.get('attendees')?.has('attendee_category')).toBe(true);
  });

  it('mergeExpectedColumns includes REQUIRED_APP_COLUMNS', () => {
    const merged = mergeExpectedColumns(new Map());
    for (const [table, cols] of Object.entries(REQUIRED_APP_COLUMNS)) {
      for (const col of cols) {
        expect(merged.get(table)?.has(col)).toBe(true);
      }
    }
  });

  it('diffMigrationHistory finds missing local versions on remote', () => {
    const { missingOnRemote, orphanOnRemote } = diffMigrationHistory(
      ['20260527110000', '20260527120000'],
      ['20260527110000'],
    );
    expect(missingOnRemote).toEqual(['20260527120000']);
    expect(orphanOnRemote).toEqual([]);
  });

  it('diffSchemaColumns reports missing columns', () => {
    const expected = new Map([['attendees', new Set(['attendee_category'])]]);
    const actual = new Map([['attendees', new Set(['id', 'email'])]]);
    const missing = diffSchemaColumns(expected, actual);
    expect(missing).toEqual([{ table: 'attendees', column: 'attendee_category' }]);
  });

  it('parses supabase db query JSON rows', () => {
    const versions = rowsToVersionList({
      rows: [{ version: '20260527110000' }, { version: '20260527120000' }],
    });
    expect(versions).toEqual(['20260527110000', '20260527120000']);

    const cols = rowsToColumnMap({
      rows: [
        { table_name: 'attendees', column_name: 'attendee_category' },
        { table_name: 'attendees', column_name: 'email' },
      ],
    });
    expect(cols.get('attendees')?.has('attendee_category')).toBe(true);
    expect(cols.get('attendees')?.has('email')).toBe(true);
  });
});
