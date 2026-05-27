#!/usr/bin/env node
// scripts/check-migrations-parity.mjs
//
// Verifies SCAGO + GANSID databases match the repo's migration-derived schema
// and (for GANSID) migration history. SCAGO often has different version ids in
// supabase_migrations.schema_migrations (MCP-applied SQL); schema column parity
// is the hard gate — history drift is a warning with apply hints.
//
// Requires: Supabase CLI logged in (`npx supabase login`).
//
// Usage:
//   npm run check:migrations
//   node scripts/check-migrations-parity.mjs
//   node scripts/check-migrations-parity.mjs --strict-history   # fail SCAGO history too

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TENANTS,
  listLocalMigrationVersions,
  listLocalMigrationFiles,
  expectedColumnsFromMigrations,
  mergeExpectedColumns,
  diffMigrationHistory,
  diffSchemaColumns,
  parseSupabaseJsonStdout,
  rowsToVersionList,
  rowsToColumnMap,
} from './lib/migration-parity.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const PROJECT_REF_FILE = path.join(ROOT, 'supabase', '.temp', 'project-ref');

const strictHistory = process.argv.includes('--strict-history');

function readLinkedRef() {
  try {
    return fs.readFileSync(PROJECT_REF_FILE, 'utf8').trim();
  } catch {
    return null;
  }
}

function linkProject(projectRef) {
  execSync(`npx --yes supabase link --project-ref ${projectRef} --yes`, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
}

function runDbQueryJson(sql) {
  const escaped = sql.replace(/"/g, '\\"');
  const out = execSync(
    `npx --yes supabase db query --linked -o json "${escaped}"`,
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
  );
  return parseSupabaseJsonStdout(out);
}

function fetchRemoteVersions() {
  const payload = runDbQueryJson(
    'SELECT version FROM supabase_migrations.schema_migrations ORDER BY version',
  );
  return rowsToVersionList(payload);
}

function fetchRemoteColumns(tables) {
  if (!tables.length) return new Map();
  const inList = tables.map(t => `'${t}'`).join(',');
  const payload = runDbQueryJson(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${inList}) ORDER BY table_name, column_name`,
  );
  return rowsToColumnMap(payload);
}

function main() {
  const previousRef = readLinkedRef();
  const localVersions = listLocalMigrationVersions(MIGRATIONS_DIR);
  const localFiles = listLocalMigrationFiles(MIGRATIONS_DIR);
  const expectedCols = mergeExpectedColumns(expectedColumnsFromMigrations(MIGRATIONS_DIR));
  const tables = [...expectedCols.keys()];

  console.log(`Local migrations: ${localVersions.length} files in supabase/migrations/`);
  console.log(`Schema columns to verify: ${tables.length} table(s), ${[...expectedCols.values()].reduce((n, s) => n + s.size, 0)} column(s)\n`);

  let errors = 0;
  let warnings = 0;

  for (const tenant of TENANTS) {
    console.log(`▶ ${tenant.name} (${tenant.projectRef})`);
    try {
      linkProject(tenant.projectRef);
      const remoteVersions = fetchRemoteVersions();
      const remoteCols = fetchRemoteColumns(tables);
      const { missingOnRemote, orphanOnRemote } = diffMigrationHistory(localVersions, remoteVersions);
      const missingCols = diffSchemaColumns(expectedCols, remoteCols);

      if (missingCols.length) {
        errors += missingCols.length;
        console.error(`  ✗ schema: ${missingCols.length} column(s) missing (apply migration SQL + reload PostgREST):`);
        for (const { table, column } of missingCols) {
          console.error(`      - public.${table}.${column}`);
        }
      } else {
        console.log(`  ✓ schema: all expected columns present`);
      }

      if (missingOnRemote.length) {
        const isScago = tenant.name === 'SCAGO';
        const lines = missingOnRemote.map(v => {
          const file = localFiles.get(v);
          return `      - ${v}${file ? ` (${file})` : ''}`;
        });
        if (isScago && !strictHistory) {
          warnings += missingOnRemote.length;
          console.warn(`  ⚠ history: ${missingOnRemote.length} local migration id(s) not recorded on remote (SCAGO often uses different version ids — fix with db query -f + migration repair):`);
          for (const line of lines) console.warn(line);
        } else {
          errors += missingOnRemote.length;
          console.error(`  ✗ history: ${missingOnRemote.length} local migration(s) not applied on remote:`);
          for (const line of lines) console.error(line);
        }
      } else {
        console.log(`  ✓ history: every local migration version is recorded on remote`);
      }

      if (orphanOnRemote.length) {
        warnings += 1;
        console.warn(`  ⚠ history: ${orphanOnRemote.length} remote-only version id(s) (not in repo — usually MCP/legacy; safe to ignore if schema is green)`);
      }
    } catch (e) {
      errors++;
      console.error(`  ✗ failed to inspect ${tenant.name}: ${e?.message ?? e}`);
    }
    console.log('');
  }

  if (previousRef) {
    try {
      linkProject(previousRef);
    } catch {
      console.warn(`⚠ could not restore linked project ref to ${previousRef}`);
    }
  }

  if (errors > 0) {
    console.error(`✗ check:migrations: ${errors} error(s). Apply missing SQL to BOTH projects (see CLAUDE.md §15).`);
    console.error('  SCAGO: npx supabase link --project-ref iigbgbgakevcgilucvbs --yes');
    console.error('         npx supabase db query --linked -f supabase/migrations/<file>.sql');
    console.error('         npx supabase migration repair --status applied <version>');
    console.error('  GANSID: echo y | npx supabase db push --include-all');
    process.exit(1);
  }

  if (warnings > 0) {
    console.warn(`⚠ check:migrations: passed schema parity with ${warnings} warning(s).`);
  } else {
    console.log('✓ check:migrations: SCAGO and GANSID schema parity OK.');
  }
  process.exit(0);
}

main();
