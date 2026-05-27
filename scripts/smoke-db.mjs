#!/usr/bin/env node
// scripts/smoke-db.mjs
//
// Post-deploy database read-path smoke probe. Hits PostgREST with the anon
// key on each project and runs canary queries against the critical tables.
// Any 5xx, any error body, or any PostgreSQL error code (e.g. 42P17 RLS
// recursion) makes this script exit 1 — exactly the signal a deploy script
// or operator needs to roll a migration back.
//
// Reads URLs and keys from `.env.smoke` (gitignored). Template at
// `.env.smoke.example` — copy and fill in. Anon keys are NOT secret
// (Netlify already exposes them in built bundles), so this file just keeps
// them out of the repo.
//
// Usage:  npm run smoke:db
// Manual: node scripts/smoke-db.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.resolve(__dirname, '..', '.env.smoke');

// ── Load .env.smoke ──────────────────────────────────────────────────
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) {
    console.error(`✗ smoke-db: missing ${ENV_FILE}.`);
    console.error('  Copy .env.smoke.example to .env.smoke and fill in the anon keys + URLs.');
    process.exit(2);
  }
  const out = {};
  for (const raw of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    out[line.slice(0, eq).trim()] = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
  }
  return out;
}

const env = loadEnv();

// ── Project definitions ─────────────────────────────────────────────
// Each project gets a name (for output), a URL, and an anon key. The URL
// fields are NOT required to be present in .env.smoke — a project listed
// here with missing creds is treated as "not configured, skipping".
const PROJECTS = [
  {
    name: 'SCAGO',
    url: env.SCAGO_SUPABASE_URL,
    anonKey: env.SCAGO_SUPABASE_ANON_KEY,
  },
  {
    name: 'GANSID',
    url: env.GANSID_SUPABASE_URL,
    anonKey: env.GANSID_SUPABASE_ANON_KEY,
  },
];

// Canary queries — these are the table reads that the dashboard / portal
// / form-builder all depend on. If any of these returns an error, the
// data plane is broken. Each entry: `{ path, expect }`. The path is the
// PostgREST endpoint; `expect` is the success predicate.
const CANARIES = [
  { path: '/rest/v1/attendees?select=id&limit=1', label: 'attendees read' },
  { path: '/rest/v1/forms?select=id&limit=1', label: 'forms read' },
  { path: '/rest/v1/profiles?select=id&limit=1', label: 'profiles read (admin RLS)' },
  { path: '/rest/v1/app_settings?select=id&limit=1', label: 'app_settings read' },
];

// ── Probe one URL with one anon key ─────────────────────────────────
async function probe(project, canary) {
  const url = `${project.url.replace(/\/$/, '')}${canary.path}`;
  let resp, body;
  try {
    resp = await fetch(url, {
      headers: {
        apikey: project.anonKey,
        Authorization: `Bearer ${project.anonKey}`,
      },
    });
    body = await resp.text();
  } catch (e) {
    return { ok: false, status: 0, error: `network: ${e?.message ?? e}` };
  }

  // 2xx + JSON body that parses (array or object) → success.
  if (resp.ok) {
    try {
      JSON.parse(body);
      return { ok: true, status: resp.status, sample: body.slice(0, 80) };
    } catch {
      return { ok: false, status: resp.status, error: `non-JSON body: ${body.slice(0, 200)}` };
    }
  }

  // 4xx/5xx — surface the PostgREST error payload verbatim so the
  // operator sees the actual Postgres code (e.g. 42P17 recursion).
  let pgCode = null;
  let pgMessage = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body);
    pgCode = parsed.code ?? null;
    pgMessage = parsed.message ?? body.slice(0, 300);
  } catch {
    // body wasn't JSON
  }
  return { ok: false, status: resp.status, pgCode, error: pgMessage };
}

// ── Main ────────────────────────────────────────────────────────────
let failures = 0;
const skipped = [];

for (const project of PROJECTS) {
  if (!project.url || !project.anonKey) {
    skipped.push(project.name);
    continue;
  }
  console.log(`▶ ${project.name}  ${project.url}`);
  for (const canary of CANARIES) {
    const r = await probe(project, canary);
    if (r.ok) {
      console.log(`  ✓ ${canary.label.padEnd(34)} ${r.status}`);
    } else {
      failures++;
      console.error(`  ✗ ${canary.label.padEnd(34)} ${r.status}${r.pgCode ? ` (${r.pgCode})` : ''}  ${r.error}`);
    }
  }
}

if (skipped.length) {
  console.warn(`\n⚠ skipped (missing creds in .env.smoke): ${skipped.join(', ')}`);
}

if (failures > 0) {
  console.error(`\n✗ smoke-db: ${failures} canary failure(s). The data plane is broken on at least one project — roll back the most recent migration before continuing.`);
  process.exit(1);
}

console.log(`\n✓ smoke-db: all canaries green${skipped.length ? ' (some projects skipped)' : ''}`);
process.exit(0);
