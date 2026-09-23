#!/usr/bin/env node
// scripts/qa/qa-run.mjs — the QA agent's driver.
//
// Signs in to the admin dashboard as a real browser user, creates clearly
// labelled test registrations, walks the flows this repo ships, takes a
// screenshot at every step, and deletes its own test data afterwards. It
// exits non-zero on any failed check and writes a report the PR can cite.
//
//   node scripts/qa/qa-run.mjs                 # --mode=mock: no tenant needed
//   node scripts/qa/qa-run.mjs --mode=live     # against a real project
//
// Live mode reads:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SITE  — the tenant to drive
//   QA_ADMIN_EMAIL, QA_ADMIN_PASSWORD                     — a dedicated QA admin
//   QA_TEST_INBOX      — an inbox you control; every test address is a +tag on it
//   QA_BASE_URL        — optional: drive a deployed URL instead of starting vite
//   QA_KEEP=1          — optional: leave the test rows in place for inspection
//
// Safety rules baked in (see docs/qa/README.md):
//   * Test rows are named "QA-TEST …" and stamped answers._qa_run=<run id>;
//     cleanup deletes by that stamp and verifies nothing is left.
//   * A bulk send is only ever CONFIRMED when every selected recipient is a
//     QA test address. On the Signups tab (real people) the run deselects
//     everyone, proves the send button is disabled, and closes.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  return m ? [m[1], m[2] ?? 'true'] : [a, 'true'];
}));
const MODE = args.mode || process.env.QA_MODE || 'mock';
const KEEP = args.keep === 'true' || process.env.QA_KEEP === '1';
const RUN_ID = `qa-${Date.now().toString(36)}`;
const STARTED_AT = new Date().toISOString();
const OUT = path.resolve(process.env.QA_OUT || path.join(ROOT, 'qa-output', `${MODE}-${new Date().toISOString().replace(/[:.]/g, '-')}`));
fs.mkdirSync(OUT, { recursive: true });

const results = [];
let shotIndex = 0;
const log = (...a) => console.log('[qa]', ...a);
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  return !!pass;
};

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(import.meta.url)(path.join(root, 'playwright'));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const { port } = srv.address(); srv.close(() => resolve(port)); });
    srv.on('error', reject);
  });
}

async function waitFor(url, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(url); if (r.ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(`dev server did not answer at ${url}`);
}

async function startVite(env) {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT,
    env: { ...process.env, ...env, BROWSER: 'none' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logFile = fs.createWriteStream(path.join(OUT, 'vite.log'));
  child.stdout.pipe(logFile); child.stderr.pipe(logFile);
  const base = `http://127.0.0.1:${port}`;
  await waitFor(base + '/');
  return { base, stop: () => child.kill('SIGTERM') };
}

// ── Screenshot helpers ────────────────────────────────────────────────────
// The admin shell scrolls inside <main> (h-dvh + overflow), so a plain
// full-page capture would stop at the fold. Relax the scroll containers for
// the capture and put them back.
async function shot(page, name, { full = true } = {}) {
  const file = path.join(OUT, `${String(++shotIndex).padStart(2, '0')}-${name}.png`);
  // Keep the pointer off the hover-expanding sidebar so captures are stable.
  await page.mouse.move(900, 400);
  if (full) {
    const vp = page.viewportSize();
    const needed = await page.evaluate(() => {
      const main = document.querySelector('main');
      return Math.max(main ? main.scrollHeight : 0, document.documentElement.scrollHeight);
    });
    const height = Math.min(Math.max(vp.height, needed + 24), 6000);
    await page.setViewportSize({ width: vp.width, height });
    await page.waitForTimeout(250);
    await page.screenshot({ path: file });
    await page.setViewportSize(vp);
  } else {
    await page.screenshot({ path: file });
  }
  log('screenshot', path.basename(file));
  return file;
}

async function modalShot(page, name) {
  const file = path.join(OUT, `${String(++shotIndex).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  log('screenshot', path.basename(file));
  return file;
}

const tabButton = (page, label) => page.locator('button', { hasText: new RegExp(`^${label}(\\s*\\d+)?$`) }).first();

// ── REST helper (live mode) ───────────────────────────────────────────────
function makeRest(url, anonKey, token) {
  return async (pathAndQuery, { method = 'GET', body, prefer } = {}) => {
    const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) throw new Error(`${method} ${pathAndQuery} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    return data;
  };
}

const uuid = () => crypto.randomUUID();

function testRows({ eventForm, orgForm, staffFormId, inbox }) {
  const [local, domain] = inbox.split('@');
  // An inbox that already carries a +tag (dapo+qa@…) must not get a second
  // '+' stacked on it — plenty of providers and address validators reject
  // that, and the run would fail on a bad recipient rather than on anything
  // under test. Extend the existing tag instead.
  const sep = local.includes('+') ? '-' : '+';
  const addr = (tag) => `${local}${sep}${RUN_ID}-${tag}@${domain}`;
  const now = new Date().toISOString();
  const orgId = uuid();
  const marker = { _qa_run: RUN_ID };
  const row = (over) => ({
    id: uuid(), form_title: null, registered_at: now, payment_status: 'paid', is_test: false, is_primary: true,
    primary_attendee_id: null, guest_type: null, sponsor_tier: null, exhibitor_booth_type: null, company_info: null,
    ...over, qr_payload: JSON.stringify({ id: over.id ?? '' }),
  });
  const rows = [
    row({
      id: orgId, form_id: orgForm.id, form_title: orgForm.title, name: 'QA-TEST Acme Health [Sponsor]', email: addr('org'),
      ticket_type: 'Sponsor', payment_method: 'external', payment_amount: 'PAID EXTERNALLY', sponsor_tier: 'gold',
      sponsor_items: [{ key: 'gold', type: 'package', label: 'QA-TEST Gold Sponsorship', qty: 1, subtotal: 0 }],
      company_info: { orgName: 'QA-TEST Acme Health', contactName: 'QA Contact' }, answers: marker,
    }),
    row({
      form_id: staffFormId, name: 'QA-TEST Delegate One', email: addr('delegate-1'), ticket_type: 'Full Congress',
      payment_method: 'external', payment_amount: 'PAID EXTERNALLY', is_primary: false, primary_attendee_id: orgId,
      guest_type: 'staff-claimed', answers: { ...marker, staffCategory: 'full_access' },
    }),
    row({
      form_id: staffFormId, name: 'QA-TEST Delegate Two', email: addr('delegate-2'), ticket_type: 'Hall Only',
      payment_method: 'external', payment_amount: 'PAID EXTERNALLY', is_primary: false, primary_attendee_id: orgId,
      guest_type: 'staff-pending', answers: { ...marker, staffCategory: 'hall_only' },
    }),
    row({
      form_id: eventForm.id, form_title: eventForm.title, name: 'QA-TEST Attendee', email: addr('attendee'),
      ticket_type: 'QA-TEST Regular', payment_status: 'free', payment_method: null, payment_amount: '0', answers: marker,
    }),
  ];
  // qr_payload needs the final id; the spread above ran before `id` for
  // generated rows, so restamp.
  for (const r of rows) r.qr_payload = JSON.stringify({ id: r.id });
  // Every row in a batch must carry an identical key set. Only the sponsor row
  // has `sponsor_items`, and PostgREST answers that with a flat
  // 400 PGRST102 "All object keys must match". Where it doesn't reject it
  // NULL-fills instead, which is the same trap that broke every group
  // registration in production (see _shared/attendeeRows.ts). Normalise to the
  // union of keys so neither outcome is possible.
  const allKeys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  for (const r of rows) for (const k of allKeys) if (!(k in r)) r[k] = null;
  return { rows, orgId, addresses: rows.map(r => r.email) };
}

// ── The flows ─────────────────────────────────────────────────────────────
async function runFlows({ page, mode, testAddresses, expectRows, expectDelegates, expectHiddenSeats }) {
  // 1. Dashboard + stats
  await page.goto(page.url().split('#')[0] + '#/admin');
  await page.waitForSelector('[data-testid="stat-total-registrations"]', { timeout: 60000 });
  await page.waitForTimeout(1500);
  check('dashboard renders with stats', true);
  const stripVisible = await page.locator('[data-testid="stat-sponsors-exhibitors"]').isVisible().catch(() => false);
  check('Sponsors & Exhibitors strip is on the main dashboard', stripVisible);
  await shot(page, 'dashboard-overview');

  // 2. Live tab: sponsor + delegates beside everyone else
  await tabButton(page, 'Live').click();
  const search = page.locator('input[placeholder="Search..."]');
  await search.fill('QA-TEST');
  await page.waitForTimeout(600);
  const qaRows = page.locator('table tbody tr', { hasText: 'QA-TEST' });
  const rowCount = await qaRows.count();
  check('Live tab shows the org booking AND its delegates together', rowCount === expectRows, `${rowCount} rows (expected ${expectRows})`);
  const kinds = (await page.locator('table tbody tr:has-text("QA-TEST") [data-testid="cell-kind"]').allInnerTexts()).map(t => t.split('\n')[0]);
  check('Type column labels org / delegate / attendee', kinds.includes('SPONSOR') && kinds.includes('DELEGATE') && kinds.includes('ATTENDEE'), kinds.join(', '));
  await shot(page, 'live-tab-unified-search');

  // 3. Type filter → delegates only
  await page.locator('[data-testid="filter-kind"]').selectOption('delegates');
  await page.waitForTimeout(500);
  const delegateRows = await page.locator('table tbody tr', { hasText: 'QA-TEST' }).count();
  check('Type filter narrows to delegates', delegateRows === expectDelegates, `${delegateRows} rows (expected ${expectDelegates})`);
  const chip = await page.locator('span.rounded-full', { hasText: 'Sponsor / exhibitor delegates' }).first().isVisible().catch(() => false);
  check('Active-filter chip names the type filter', chip);
  await shot(page, 'live-tab-filter-delegates');
  await page.locator('[data-testid="filter-kind"]').selectOption('all');

  // 3b. Unclaimed seats are off the roster by default and one click away.
  //     A seat with no name or no address has nobody to show and nobody to
  //     send to — but it is paid-for inventory, so it must stay findable.
  const seatToggle = page.locator('[data-testid="toggle-pending-seats"]');
  const hasToggle = await seatToggle.isVisible().catch(() => false);
  check('Unclaimed-seat toggle appears when the tenant has unclaimed seats',
    hasToggle || expectHiddenSeats === 0,
    hasToggle ? await seatToggle.innerText() : 'no unclaimed seats in this tenant');
  if (hasToggle) {
    const before = await page.locator('table tbody tr', { hasText: 'QA-TEST' }).count();
    await seatToggle.click();
    await page.waitForTimeout(500);
    const after = await page.locator('table tbody tr', { hasText: 'QA-TEST' }).count();
    check('Turning it on reveals the hidden seats, and only those',
      after - before === expectHiddenSeats,
      `${before} → ${after} rows (expected +${expectHiddenSeats})`);
    await shot(page, 'live-tab-unclaimed-seats');
    await seatToggle.click();
    await page.waitForTimeout(400);
    const restored = await page.locator('table tbody tr', { hasText: 'QA-TEST' }).count();
    check('Turning it off hides them again', restored === before, `${restored} rows`);
  }

  // 4. Delegate detail modal
  const delegateRow = page.locator('table tbody tr', { hasText: 'QA-TEST Delegate One' }).first();
  await delegateRow.locator('button[title="View Details"]').click();
  await page.waitForTimeout(800);
  const delegatePill = await page.locator('text=/Delegate · QA-TEST Acme Health/').first().isVisible().catch(() => false);
  check('Attendee detail labels the delegate with its organization', delegatePill);
  await modalShot(page, 'delegate-detail-modal');
  await page.locator('button[aria-label="Close attendee details"]').click();
  await page.waitForTimeout(400);

  // 5. Bulk email from the attendee list (only QA addresses are matched)
  await search.fill('QA-TEST');
  await page.waitForTimeout(500);
  const emailBtn = page.locator('[data-testid="attendees-email-all"]');
  check('Email button reflects the filtered count', (await emailBtn.innerText()).includes(`(${expectRows})`), await emailBtn.innerText());
  await emailBtn.click();
  const modal = page.locator('[data-testid="bulk-email-modal"]');
  await modal.waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  await modalShot(page, 'bulk-email-compose');
  await modal.locator('button', { hasText: 'Review recipients' }).click();
  await page.waitForTimeout(500);
  const reviewRows = await modal.locator('label:has(input[type="checkbox"])').count();
  const reviewText = await modal.innerText();
  check('Review step lists every recipient with a working address', reviewText.includes(`${expectRows - 0} of`) || reviewRows >= expectRows, `${reviewRows} rows`);
  await modalShot(page, 'bulk-email-review');
  // Guard: confirm only when the modal contains nothing but QA addresses.
  const listedEmails = (await modal.locator('label:has(input[type="checkbox"]) .text-xs').allInnerTexts()).map(s => s.trim().toLowerCase());
  const onlyQa = listedEmails.length > 0 && listedEmails.every(e => testAddresses.some(t => t.toLowerCase() === e));
  check('Every listed recipient is a QA test address (send guard)', onlyQa, listedEmails.join(', '));
  if (onlyQa) {
    await modal.locator('[data-testid="bulk-email-send"]').click();
    await modal.locator('[data-testid="bulk-email-confirm"]').click();
    await modal.locator('text=/Done — /').waitFor({ timeout: 120000 });
    const doneText = await modal.innerText();
    check('Bulk send completes with every recipient sent', /Done — \d+ sent$/m.test(doneText) && !/failed/.test(doneText), doneText.match(/Done — [^\n]*/)?.[0]);
    await modalShot(page, 'bulk-email-sent');
    await modal.locator('button', { hasText: /^Close$/ }).click();
  } else {
    await modal.locator('button[aria-label="Close"]').click();
  }
  await page.waitForTimeout(400);

  // 6. Sponsors tab on the main dashboard
  await search.fill('');
  await tabButton(page, 'Sponsors').click();
  await page.waitForTimeout(800);
  const sponsorsTab = page.locator('[data-testid="sponsors-tab"]');
  const sponsorsText = await sponsorsTab.innerText().catch(() => '');
  check('Sponsors tab lists the sponsor booking on the main dashboard', sponsorsText.includes('QA-TEST Acme Health'));
  await shot(page, 'sponsors-tab');

  // 7. Exhibitors tab (when the site has exhibitor forms)
  if (await tabButton(page, 'Exhibitors').isVisible().catch(() => false)) {
    await tabButton(page, 'Exhibitors').click();
    await page.waitForTimeout(800);
    await shot(page, 'exhibitors-tab');
    check('Exhibitors tab renders', true);
  }

  // 8. Signups tab: filter + "Email all" without ever sending to real people
  if (await tabButton(page, 'Signups').isVisible().catch(() => false)) {
    await tabButton(page, 'Signups').click();
    await page.waitForTimeout(1500);
    await page.locator('button', { hasText: /^In progress/ }).first().click();
    await page.waitForTimeout(600);
    await shot(page, 'signups-in-progress');
    const emailAll = page.locator('[data-testid="signups-email-all"]');
    const label = await emailAll.innerText();
    const n = Number(/\((\d+)\)/.exec(label)?.[1] ?? 0);
    check('Signups "Email all" reflects the active filter', /Email all \(\d+\)/.test(label), label);
    if (n > 0 && await emailAll.isEnabled()) {
      await emailAll.click();
      const m2 = page.locator('[data-testid="bulk-email-modal"]');
      await m2.waitFor({ timeout: 10000 });
      await page.waitForTimeout(600);
      const templateValue = await m2.locator('select').first().inputValue();
      check('In-progress audience opens on the Registration Reminder template', templateValue === 'reminder', templateValue);
      await modalShot(page, 'signups-bulk-compose');
      await m2.locator('button', { hasText: 'Review recipients' }).click();
      await page.waitForTimeout(500);

      // Repeat-send guard. One seeded signup already has an email_sends row
      // whose subject is exactly what the Reminder template renders for them,
      // so the review step must say so and offer to drop them — otherwise
      // finishing a cancelled run silently double-emails the first batch.
      // Asserted in mock mode only: the fixture guarantees exactly one such
      // recipient. On a real tenant whether anyone matches depends on that
      // tenant's send history, so there is nothing to assert — and nothing is
      // clicked either, because the live run must not touch the selection of
      // real people.
      const repeatWarning = m2.locator('[data-testid="bulk-email-repeat-warning"]');
      if (mode === 'mock') {
        const repeatShown = await repeatWarning.isVisible().catch(() => false);
        check(
          'Review step warns when someone already got this exact subject',
          repeatShown,
          repeatShown ? (await repeatWarning.innerText()).replace(/\s+/g, ' ').slice(0, 130) : 'no warning shown',
        );
        if (repeatShown) {
          const selectedCountText = () => m2.locator('text=/ of \\d+ selected/').first().innerText();
          const before = parseInt(await selectedCountText(), 10);
          await m2.locator('[data-testid="bulk-email-deselect-repeats"]').click();
          await page.waitForTimeout(300);
          const after = parseInt(await selectedCountText(), 10);
          check('"Deselect" drops the already-emailed recipients', after < before, `${before} selected → ${after}`);
          // Put them back — the rest of the run expects the full audience.
          await m2.locator('label', { hasText: /Select all/ }).locator('input').click();
          await page.waitForTimeout(300);
        }
      }

      if (mode === 'live') {
        // Real people: prove the deselect-all path, never confirm.
        await m2.locator('label', { hasText: /Deselect all/ }).locator('input').click();
        await page.waitForTimeout(300);
        const disabled = await m2.locator('[data-testid="bulk-email-send"]').isDisabled();
        check('Deselecting everyone disables Send (no accidental real send)', disabled);
        await modalShot(page, 'signups-bulk-review-deselected');
      } else {
        await modalShot(page, 'signups-bulk-review');
        await m2.locator('[data-testid="bulk-email-send"]').click();
        await m2.locator('[data-testid="bulk-email-confirm"]').click();
        await m2.locator('text=/Done — /').waitFor({ timeout: 60000 });
        check('Signups bulk send completes (mock transport)', /Done — \d+ sent/.test(await m2.innerText()));
        await modalShot(page, 'signups-bulk-sent');
      }
      await m2.locator('button[aria-label="Close"]').click().catch(() => {});
      await page.waitForTimeout(300);
    }
  }

  // 9. Mobile check of the unified list
  await page.setViewportSize({ width: 390, height: 844 });
  await tabButton(page, 'Live').click();
  await page.waitForTimeout(600);
  await shot(page, 'live-tab-mobile', { full: false });
  await page.setViewportSize({ width: 1440, height: 1000 });
}

// ── Complete your registration (mock only) ────────────────────────────────
//
// Mock only, deliberately. The real registration-complete function ships when
// this merges, and even then the live run must never tick a real registrant's
// consent boxes or email them a link. The fixture speaker, Dr. Lena Fischer,
// has the shape of the case that motivated the feature: comped, ticketed, and
// never asked for her name or consents.
async function runCompletionFlows({ page, base, mock }) {
  await page.goto(base + '/#/admin');
  await page.waitForSelector('[data-testid="stat-total-registrations"]', { timeout: 60000 });
  await tabButton(page, 'Live').click();
  await page.locator('input[placeholder="Search..."]').fill('');
  await page.waitForTimeout(500);

  // 1. The dashboard names the gap and filters to it.
  const toggle = page.locator('[data-testid="toggle-incomplete"]');
  const toggleShown = await toggle.isVisible().catch(() => false);
  check('"Details incomplete" appears when someone is missing required answers', toggleShown,
    toggleShown ? (await toggle.innerText()).replace(/\s+/g, ' ') : 'not shown');
  if (!toggleShown) return;
  await toggle.click();
  await page.waitForTimeout(500);
  const rows = page.locator('table tbody tr');
  const names = (await rows.allInnerTexts()).map(t => t.split('\n')[0]).join(' | ');
  check('It filters to exactly the incomplete registration', (await rows.count()) === 1 && /Lena Fischer/.test(names), names);
  await shot(page, 'live-tab-details-incomplete');

  // 2. The attendee record says what is missing and offers to ask.
  await rows.first().locator('button[title="View Details"]').click();
  await page.waitForTimeout(700);
  await page.locator('button', { hasText: /^Responses/ }).first().click();
  await page.waitForTimeout(400);
  const panel = page.locator('[data-testid="completeness-panel"]');
  const panelText = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('The attendee record lists the unanswered questions', /never answered/.test(panelText) && /full name/i.test(panelText), panelText.slice(0, 140));
  check('It flags the consents she has not given', /required polic/.test(panelText));
  await modalShot(page, 'attendee-completeness-panel');
  await page.locator('button[aria-label="Close attendee details"]').click();
  await page.waitForTimeout(400);

  // 3. Asking everyone at once shows who was sent, skipped, and why.
  await page.locator('[data-testid="send-completion-links"]').click();
  const dialog = page.locator('[data-testid="completion-send-dialog"]');
  await dialog.waitFor({ timeout: 10000 });
  await modalShot(page, 'completion-send-confirm');
  await dialog.locator('[data-testid="completion-send-confirm"]').click();
  await dialog.locator('text=/\\d+ sent · \\d+ skipped/').waitFor({ timeout: 20000 });
  const summary = (await dialog.innerText()).replace(/\s+/g, ' ');
  check('Bulk completion send reports each outcome', /1 sent · 0 skipped · 0 failed/.test(summary), summary.slice(0, 120));
  const sendCall = mock.calls.functions.find(c => c.name === 'registration-complete' && c.body?.action === 'send');
  check('It asked the server to send exactly that registrant', JSON.stringify(sendCall?.body?.attendeeIds ?? []) === JSON.stringify([LENA_ID]));
  await modalShot(page, 'completion-send-results');
  await dialog.locator('button', { hasText: 'Done' }).click();
  await page.locator('[data-testid="toggle-incomplete"]').click();

  // 4. The registrant's side: only what is missing, consents last.
  await page.goto(base + '/#/complete?token=qa-mock-token');
  await page.locator('text=/you.re registered for/').waitFor({ timeout: 20000 });
  const pageText = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  check('The completion page greets the registrant', /Hello Lena/.test(pageText));
  // Labels are CSS-uppercased and innerText returns them transformed — match case-insensitively.
  check('It asks what is missing and nothing they already gave', /full name/i.test(pageText) && !/professional role/i.test(pageText.split(/what we already have/i)[0]));
  check('It never offers the email address for editing', (await page.locator('input[type="email"]').count()) === 0);
  await shot(page, 'complete-registration-form');

  await page.locator('button', { hasText: 'Save my details' }).click();
  await page.waitForTimeout(300);
  const blocked = await page.locator('[role="alert"]').innerText().catch(() => '');
  check('Saving without the required answers is refused, with a reason', /Please answer|Please confirm/.test(blocked), blocked);

  await page.locator('input[type="text"]').first().fill('Lena Fischer');
  await page.locator('textarea').first().fill('Vegetarian, no nuts');
  for (const box of await page.locator('fieldset input[type="checkbox"]').all()) await box.check();
  await page.locator('button', { hasText: 'Save my details' }).click();
  await page.locator("text=/you.re all set/").waitFor({ timeout: 20000 });
  const completeCall = mock.calls.functions.find(c => c.name === 'registration-complete' && c.body?.action === 'complete');
  const sentAnswers = completeCall?.body?.answers ?? {};
  check('Completion submits the answers and both consents',
    sentAnswers.f_name === 'Lena Fischer' && sentAnswers.f_consent_photo === true && sentAnswers.f_consent_terms === true,
    JSON.stringify(sentAnswers));
  check('It never submits an answer that was already on file', !('f_role' in sentAnswers) && !('f_country' in sentAnswers));
  await shot(page, 'complete-registration-done');
}

const LENA_ID = '00000000-0000-4000-8000-000000000104';

/** Mock of supabase/functions/registration-complete for the fixture tenant. */
function completionMock(tables) {
  const lena = () => tables.attendees.find(a => a.id === LENA_ID);
  const form = () => tables.forms.find(f => f.id === 'gansid-congress-2026');
  return (name, body) => {
    if (name !== 'registration-complete') return null;
    const f = form();
    const row = lena();
    const askable = f.fields.filter(x => !['email', 'ticket', 'registration-mode-selector'].includes(x.type) && !x.usedForPricing);
    const answered = (x, v) => x.type === 'boolean' ? (x.required ? v === true : true)
      : Array.isArray(v) ? v.length > 0 : v !== undefined && v !== null && String(v).trim() !== '';
    if (body?.action === 'resolve') {
      return { body: {
        ok: true, site: 'gansid', eventName: f.title,
        attendee: { firstName: 'Lena', name: row.name, email: row.email },
        complete: false, completedAt: null,
        fields: askable,
        outstandingIds: askable.filter(x => !answered(x, row.answers?.[x.id])).map(x => x.id),
        answers: row.answers,
        summary: f.fields.filter(x => answered(x, row.answers?.[x.id])).map(x => ({ label: x.label, value: String(row.answers[x.id]) })),
      } };
    }
    if (body?.action === 'complete') {
      const a = body.answers ?? {};
      const missing = askable.find(x => x.required && !answered(x, a[x.id]) && !answered(x, row.answers?.[x.id]));
      if (missing) return { status: 422, body: { error: 'validation', message: `"${missing.label}" is required.`, fieldId: missing.id } };
      row.answers = { ...row.answers, ...a, _completed_at: new Date().toISOString() };
      return { body: { ok: true, complete: true } };
    }
    if (body?.action === 'send') {
      return { body: { ok: true, results: (body.attendeeIds ?? []).map(id => ({ attendeeId: id, status: 'sent', email: tables.attendees.find(x => x.id === id)?.email })) } };
    }
    if (body?.action === 'link') return { body: { ok: true, url: 'http://localhost/#/complete?token=qa-mock-token' } };
    return { status: 400, body: { error: 'unknown action' } };
  };
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  log(`mode=${MODE} run=${RUN_ID} out=${OUT}`);
  const { chromium } = await loadPlaywright();

  let server = null;
  let browser = null;
  let cleanup = async () => {};
  try {
    if (MODE === 'mock') {
      const fx = await import('./fixtures.mjs');
      const { createMockSupabase, fakeJwt } = await import('./mock-supabase.mjs');
      const SUPA = 'http://localhost:54999';
      server = process.env.QA_BASE_URL ? null : await startVite({ VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: 'mock-anon-key', VITE_SITE: 'gansid' });
      const base = process.env.QA_BASE_URL || server.base;
      const tables = fx.buildTables();
      const user = { id: fx.ADMIN_USER.id, email: fx.ADMIN_USER.email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: { full_name: fx.ADMIN_USER.full_name }, created_at: new Date().toISOString() };
      const token = fakeJwt(user);
      const mock = createMockSupabase({ tables, user, accessToken: token, onFunctionCall: completionMock(tables) });

      browser = await chromium.launch();
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      // Session in storage before the app boots — the key supabase-js derives from the URL host.
      await context.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); }, { key: 'sb-localhost-auth-token', session: mock.session() });
      const page = await context.newPage();
      await page.route(`${SUPA}/**`, (route, request) => mock.handle(route, request));
      await page.routeWebSocket(/realtime/, () => { /* never connects — realtime is not under test */ }).catch(() => {});
      page.on('pageerror', e => log('pageerror', e.message));
      await page.goto(base + '/#/admin');

      const testAddresses = tables.attendees.filter(a => a.email).map(a => a.email);
      // The fixture tenant already contains the "QA-TEST" shaped data under
      // real-looking names; search for the sponsor's org instead.
      // Rename fixture rows so the same assertions apply in both modes.
      for (const a of tables.attendees) {
        if (['Pfizer, Inc [Sponsor]', 'Amara Bello', 'Chen Wei', 'Grace Mensah'].includes(a.name)) {
          a.name = a.name === 'Pfizer, Inc [Sponsor]' ? 'QA-TEST Acme Health [Sponsor]'
            : a.name === 'Amara Bello' ? 'QA-TEST Delegate One'
            : a.name === 'Chen Wei' ? 'QA-TEST Delegate Two'
            : 'QA-TEST Attendee';
          if (a.company_info) a.company_info = { ...a.company_info, orgName: 'QA-TEST Acme Health' };
        }
      }
      await page.reload();
      // One fixture delegate — the sponsor's staff slot #3 — has a placeholder
      // name and no address, so it sits behind the unclaimed-seat toggle.
      await runFlows({ page, mode: 'mock', testAddresses, expectRows: 5, expectDelegates: 3, expectHiddenSeats: 1 });
      check('Mock transport received bulk sends', mock.calls.functions.filter(c => c.name === 'send-ticket-email').length >= 4, `${mock.calls.functions.length} function calls`);
      await runCompletionFlows({ page, base, mock });
    } else {
      const SUPA = process.env.VITE_SUPABASE_URL;
      const ANON = process.env.VITE_SUPABASE_ANON_KEY;
      const SITE = process.env.VITE_SITE || 'gansid';
      const inbox = process.env.QA_TEST_INBOX;
      const email = process.env.QA_ADMIN_EMAIL;
      const password = process.env.QA_ADMIN_PASSWORD;
      for (const [k, v] of Object.entries({ VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: ANON, QA_TEST_INBOX: inbox, QA_ADMIN_EMAIL: email, QA_ADMIN_PASSWORD: password })) {
        if (!v) throw new Error(`live mode needs ${k}`);
      }
      server = process.env.QA_BASE_URL ? null : await startVite({ VITE_SUPABASE_URL: SUPA, VITE_SUPABASE_ANON_KEY: ANON, VITE_SITE: SITE });
      const base = process.env.QA_BASE_URL || server.base;

      browser = await chromium.launch();
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.on('pageerror', e => log('pageerror', e.message));

      // Sign in through the real login page.
      await page.goto(base + '/#/login');
      await page.locator('input[type="email"]').fill(email);
      await page.locator('input[type="password"]').fill(password);
      await page.locator('button[type="submit"]').click();
      await page.waitForSelector('[data-testid="stat-total-registrations"]', { timeout: 60000 });
      check('QA admin can sign in and reach the dashboard', true);
      await shot(page, 'signed-in-dashboard');

      const token = await page.evaluate(() => {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('sb-') && k.endsWith('-auth-token')) return JSON.parse(localStorage.getItem(k)).access_token;
        }
        return null;
      });
      if (!token) throw new Error('no session token in storage after login');
      const rest = makeRest(SUPA, ANON, token);

      // Discover forms to attach the test rows to.
      const forms = await rest('forms?select=id,title,form_type,settings,created_at&order=created_at.desc');
      const orgForm = forms.find(f => f.form_type === 'sponsor_exhibitor') || forms.find(f => f.form_type === 'sponsor');
      const staffFormId = orgForm?.settings?.staffFormId;
      const eventForm = forms.find(f => (f.form_type || 'event') === 'event' && f.id !== staffFormId) || forms[0];
      if (!orgForm || !eventForm) throw new Error('tenant has no sponsor/sponsor_exhibitor form to attach a test booking to');
      const staffForm = staffFormId || eventForm.id;

      const seed = testRows({ eventForm, orgForm, staffFormId: staffForm, inbox });
      cleanup = async () => {
        if (KEEP) { log('QA_KEEP set — leaving test rows in place'); return; }
        await rest(`attendees?answers->>_qa_run=eq.${RUN_ID}`, { method: 'DELETE' });
        const left = await rest(`attendees?select=id&answers->>_qa_run=eq.${RUN_ID}`);
        check('Cleanup removed every test row', Array.isArray(left) && left.length === 0, `${left?.length ?? '?'} left`);
        // The bulk-send flow writes an email_sends row per recipient. Every QA
        // address carries the run id, so the log rows are addressable without
        // touching a real send. Runs after the verification step above, which
        // needs them present.
        await rest(`email_sends?recipient_email=like.*${RUN_ID}*`, { method: 'DELETE' });
        const logsLeft = await rest(`email_sends?select=id&recipient_email=like.*${RUN_ID}*`);
        check('Cleanup removed the run’s email_sends rows', Array.isArray(logsLeft) && logsLeft.length === 0, `${logsLeft?.length ?? '?'} left`);
      };
      await rest('attendees', { method: 'POST', body: seed.rows, prefer: 'return=minimal' });
      check('Seeded test booking, delegates and attendee', true, `${seed.rows.length} rows stamped ${RUN_ID}`);

      await page.reload();
      // Every seeded row is named and reachable, so none of them is hidden.
      await runFlows({ page, mode: 'live', testAddresses: seed.addresses, expectRows: seed.rows.length, expectDelegates: 2, expectHiddenSeats: 0 });

      // Verify the bulk send was logged for exactly the test addresses.
      const sends = await rest(`email_sends?select=recipient_email,subject,metadata,sent_at&sent_at=gte.${encodeURIComponent(STARTED_AT)}&order=sent_at.desc&limit=50`);
      const logged = sends.filter(s => seed.addresses.map(a => a.toLowerCase()).includes(String(s.recipient_email).toLowerCase()));
      const strays = sends.filter(s => !seed.addresses.map(a => a.toLowerCase()).includes(String(s.recipient_email).toLowerCase()));
      check('email_sends logged one row per QA recipient', logged.length === seed.rows.length, `${logged.length} rows`);
      check('No email was sent to anyone outside the QA inbox during the run', strays.length === 0, `${strays.length} other sends since ${STARTED_AT}`);
    }
  } catch (e) {
    check('run completed without an unexpected error', false, e?.message || String(e));
    console.error(e);
  } finally {
    try { await cleanup(); } catch (e) { check('cleanup', false, e?.message || String(e)); }
    if (browser) await browser.close().catch(() => {});
    if (server) server.stop();
  }

  const passed = results.filter(r => r.pass).length;
  const failed = results.length - passed;
  const report = { mode: MODE, runId: RUN_ID, startedAt: STARTED_AT, finishedAt: new Date().toISOString(), passed, failed, results, screenshots: fs.readdirSync(OUT).filter(f => f.endsWith('.png')) };
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  const md = [
    `# QA run — ${MODE} — ${RUN_ID}`,
    '',
    `**${passed} passed · ${failed} failed** · started ${STARTED_AT}`,
    '',
    '| Check | Result | Detail |',
    '|---|---|---|',
    ...results.map(r => `| ${r.name} | ${r.pass ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '\\|')} |`),
    '',
    '## Screenshots',
    ...report.screenshots.map(f => `- ${f}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'REPORT.md'), md);
  log(`done: ${passed} passed, ${failed} failed → ${OUT}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
