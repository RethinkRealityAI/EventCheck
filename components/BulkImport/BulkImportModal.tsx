import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Upload, FileSpreadsheet, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle,
  Loader2, Send as SendIcon, Tag, RefreshCw, ChevronDown, XCircle, Circle, Users,
  Ticket, Link2, Mail,
} from 'lucide-react';
import type { AppSettings, Form } from '../../types';
import { parseCsv, isValidEmail } from '../../utils/csv';
import { renderEmailShell, mergePlaceholders, plainTextToHtml } from '../../utils/emailShell';
import { buildOpenPixelUrl, wrapClickUrl } from '../../utils/emailTracking';
import { CURRENT_SITE } from '../../config/sites';
import { supabase } from '../../services/supabaseClient';
import { getForms } from '../../services/storageService';
import { generateTrackingId, logEmailSend } from '../../services/emailSendsService';
import {
  createImportBatch,
  claimContactForSend,
  updateContactEmailStatus,
  type ImportedContact,
  type ContactEmailStatus,
} from '../../services/importedContactsService';

// ---------------------------------------------------------------------------
// Bulk import + email campaign modal.
//
// Flow:  upload CSV → map columns (auto + manual) → review → compose → send.
// The send step throttles delivery in admin-configurable batches with a pause
// between each, marks every recipient sent / failed / skipped live (green
// check / red X), counts successes, and stays open until the run finishes so
// the operator can read the result and retry failures.
//
// Re-openable: pass `resume` with existing contacts to skip straight to the
// compose/send steps (used by the Contacts dashboard tab to retry failures or
// re-message a batch).
// ---------------------------------------------------------------------------

type Step = 'upload' | 'map' | 'review' | 'compose' | 'send';
type ColumnRole = 'email' | 'name' | 'first_name' | 'last_name' | 'extra' | 'ignore';

const UNIQUE_ROLES: ColumnRole[] = ['email', 'name', 'first_name', 'last_name'];

const ROLE_OPTIONS: Array<{ value: ColumnRole; label: string }> = [
  { value: 'email', label: 'Email' },
  { value: 'name', label: 'Full name' },
  { value: 'first_name', label: 'First name' },
  { value: 'last_name', label: 'Last name' },
  { value: 'extra', label: 'Keep as extra field' },
  { value: 'ignore', label: 'Ignore' },
];

interface EmailFields {
  heading: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  footerNote: string;
}

const DEFAULT_FIELDS: EmailFields = {
  heading: 'Hello {{first_name}}',
  message:
    "Hi {{name}},\n\n" +
    "We're reaching out with an update we think you'll want to see.\n\n" +
    "Thanks for being part of our community.",
  ctaLabel: '',
  ctaUrl: '',
  footerNote: "You're receiving this because your details were shared with us. Reply to this email with any questions.",
};

// Invite-mode defaults — the CTA links to the personalised registration link
// that contact-invite-send substitutes per recipient via {{registration_link}}.
const DEFAULT_INVITE_FIELDS: EmailFields = {
  heading: "You're invited, {{first_name}}",
  message:
    "Hi {{name}},\n\n" +
    "You've been personally invited to register for our upcoming event — at no cost to you.\n\n" +
    "Your details are already prefilled. Just click the button below to confirm your free registration and receive your ticket.",
  ctaLabel: 'Complete my free registration',
  ctaUrl: '{{registration_link}}',
  footerNote: "This invitation link is unique to you — please don't forward it. Reply to this email with any questions.",
};

// A recipient in the send queue. `id` is the DB row id in imported_contacts.
interface SendItem {
  id: string;
  name: string;
  email: string;
  extraFields: Record<string, string>;
  status: ContactEmailStatus;
  error?: string | null;
}

interface Props {
  settings: AppSettings;
  onClose: () => void;
  onComplete?: () => void;
  /**
   * Campaign (default) sends a free-form marketing email via `raw-html`.
   * Invite mints a signed free-registration link per contact via the
   * `contact-invite-send` edge function and requires a target form.
   */
  purpose?: 'campaign' | 'invite';
  /** Resume mode — skip import and send a campaign to these existing contacts. */
  resume?: { label: string; contacts: ImportedContact[] };
  /**
   * Audience pre-targeted from the Contacts tab (multi-select). When provided,
   * the modal skips import and composes for exactly these contacts. Used for
   * both invite mode and resume-style campaign sends to a hand-picked set.
   */
  selectedContacts?: { label: string; contacts: ImportedContact[] };
}

// ── placeholder helpers ────────────────────────────────────────────────────

function placeholderKey(header: string): string {
  return (header || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'field';
}

function contactVars(item: { name: string; email: string; extraFields: Record<string, string> }): Record<string, string> {
  const parts = (item.name || '').trim().split(/\s+/).filter(Boolean);
  const vars: Record<string, string> = {
    name: item.name?.trim() || item.email.split('@')[0],
    email: item.email,
    first_name: parts[0] || (item.name?.trim() || item.email.split('@')[0]),
    last_name: parts.slice(1).join(' ') || '',
  };
  for (const [k, v] of Object.entries(item.extraFields || {})) {
    vars[placeholderKey(k)] = String(v ?? '');
  }
  return vars;
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function composeBodyContent(fields: EmailFields, vars: Record<string, string>, opts: { trackingId?: string; previewMode?: boolean }): string {
  const { trackingId = '', previewMode = false } = opts;
  const heading = escapeHtmlAttr(mergePlaceholders(fields.heading || '', vars));
  const bodyHtml = plainTextToHtml(mergePlaceholders(fields.message || '', vars));
  const ctaLabel = escapeHtmlAttr(mergePlaceholders(fields.ctaLabel || '', vars));
  const rawCtaUrl = mergePlaceholders(fields.ctaUrl || '', vars);
  const ctaUrl = !previewMode && trackingId ? wrapClickUrl(trackingId, rawCtaUrl) : rawCtaUrl;
  const footerNote = escapeHtmlAttr(mergePlaceholders(fields.footerNote || '', vars));

  const headingBlock = heading ? `<h2>${heading}</h2>` : '';
  const ctaBlock = ctaLabel && rawCtaUrl
    ? `<p style="text-align:center;"><a href="${escapeHtmlAttr(ctaUrl)}" class="button">${ctaLabel}</a></p>`
    : '';
  const footerNoteBlock = footerNote ? `<p style="font-size:13px;opacity:0.6;">${footerNote}</p>` : '';
  return `${headingBlock}\n${bodyHtml}\n${ctaBlock}\n${footerNoteBlock}`;
}

function renderHtml(fields: EmailFields, vars: Record<string, string>, opts: { previewMode?: boolean; trackingId?: string } = {}): string {
  const { previewMode = false, trackingId = '' } = opts;
  return renderEmailShell({
    content: composeBodyContent(fields, vars, { trackingId, previewMode }),
    site: CURRENT_SITE.key,
    previewMode,
    trackingPixelUrl: !previewMode && trackingId ? buildOpenPixelUrl(trackingId) : undefined,
  });
}

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

// ── component ───────────────────────────────────────────────────────────────

export default function BulkImportModal({ settings, onClose, onComplete, resume, selectedContacts, purpose = 'campaign' }: Props) {
  const isInvite = purpose === 'invite';
  // A pre-targeted audience can arrive via `resume` (campaign retry) or
  // `selectedContacts` (multi-select from the Contacts tab, campaign or invite).
  const presetAudience = selectedContacts ?? resume ?? null;
  const isResume = !!presetAudience;
  const [step, setStep] = useState<Step>(isResume ? 'compose' : 'upload');

  // Upload / parse
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [columnRoles, setColumnRoles] = useState<ColumnRole[]>([]);
  const [parseError, setParseError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tag / label for the batch (batch tag + import-time tags applied to rows)
  const [tag, setTag] = useState<string>(presetAudience?.label || '');
  const [importTags, setImportTags] = useState<string[]>([]);
  const [importTagDraft, setImportTagDraft] = useState<string>('');

  // Compose
  const [subject, setSubject] = useState<string>(
    isInvite
      ? (settings.emailContactInviteSubject || "You're invited to register — " + (CURRENT_SITE.displayName || 'our event'))
      : "An update from " + (CURRENT_SITE.displayName || 'us'),
  );
  const [fields, setFields] = useState<EmailFields>({ ...(isInvite ? DEFAULT_INVITE_FIELDS : DEFAULT_FIELDS) });
  // Invite mode renders from the admin-managed Contact Invitation template
  // (Settings → Email Templates), not the structured campaign fields. Body is
  // inner HTML; {{registration_link}} stays intact for per-recipient server
  // substitution, while {{event}}/{{name}}/etc. resolve client-side at send.
  const [inviteBody, setInviteBody] = useState<string>(
    settings.emailContactInviteBody
    || '<p>You\'ve been invited to register for {{event}}.</p><p style="text-align:center;margin:28px 0;"><a href="{{registration_link}}" class="button">Confirm my free registration</a></p>',
  );

  // Invite mode — target form picker
  const [forms, setForms] = useState<Form[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [formId, setFormId] = useState<string>('');
  // Below lg the compose form + email preview can't sit side-by-side, so a
  // segmented toggle switches between them (each gets the full modal width).
  const [mobileView, setMobileView] = useState<'compose' | 'preview'>('compose');

  // Send queue + config.
  // Campaign/resume keeps each contact's persisted email_status so the queue
  // skips rows already sent. Invite is a DISTINCT action from a marketing send
  // (it mints a registration link) and is FULLY DECOUPLED from email_status —
  // invites track delivery on invite_sent_at, never touch email_status, and
  // send to ALL selected contacts regardless of campaign state. We therefore
  // seed invite items to 'pending' purely for the live UI badge (the queue does
  // not filter on it in invite mode); campaign keeps the persisted status.
  const [items, setItems] = useState<SendItem[]>(
    presetAudience
      ? presetAudience.contacts.map(c => ({
          id: c.id,
          name: c.name,
          email: c.email,
          extraFields: c.extraFields,
          status: isInvite ? 'pending' : c.emailStatus,
          error: isInvite ? null : c.emailError,
        }))
      : [],
  );
  const [batchSize, setBatchSize] = useState<number>(50);
  const [pauseSeconds, setPauseSeconds] = useState<number>(30);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [importing, setImporting] = useState(false);
  const cancelRef = useRef(false);
  const mountedRef = useRef(true);

  const smtpReady = !!(settings.smtpUser && settings.smtpPass);

  // On unmount, stop the send loop and suppress any further React state writes
  // from in-flight sends. The DB writes inside sendOne still complete so status
  // is persisted even if the operator closes the modal mid-run.
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; cancelRef.current = true; };
  }, []);

  // Guarded state setter — no-ops after unmount.
  const setItemsSafe = (updater: (prev: SendItem[]) => SendItem[]) => {
    if (mountedRef.current) setItems(updater);
  };

  // Invite mode needs a target form to mint the registration link against.
  // Load the active/draft forms once and default to the first usable one.
  useEffect(() => {
    if (!isInvite) return;
    let cancelled = false;
    setFormsLoading(true);
    (async () => {
      try {
        const all = await getForms();
        if (cancelled) return;
        // Closed forms can't accept registrations — hide them from the picker.
        const usable = all.filter(f => f.status !== 'closed');
        setForms(usable);
        // Default to the dedicated free-registration form so contacts aren't
        // accidentally invited to the paid/stepped congress form.
        setFormId(prev => prev
          || usable.find(f => f.id === 'gansid-congress-2026-invite')?.id
          || usable[0]?.id
          || '');
      } finally {
        if (!cancelled) setFormsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isInvite]);

  const selectedForm = useMemo(() => forms.find(f => f.id === formId) || null, [forms, formId]);

  // ── parsing helpers ──
  const autoAssignRoles = (hdrs: string[]): ColumnRole[] => {
    const used = new Set<ColumnRole>();
    return hdrs.map(h => {
      const t = h.trim().toLowerCase();
      let role: ColumnRole = 'extra';
      if (!used.has('email') && /e-?mail/.test(t)) role = 'email';
      else if (!used.has('name') && /^(full[\s_]*)?name$/.test(t)) role = 'name';
      else if (!used.has('first_name') && /(first|given)[\s_]*name|^first$|fname/.test(t)) role = 'first_name';
      else if (!used.has('last_name') && /(last|sur|family)[\s_]*name|^last$|lname/.test(t)) role = 'last_name';
      if (UNIQUE_ROLES.includes(role)) used.add(role);
      return role;
    });
  };

  const ingestText = useCallback((text: string, name: string) => {
    setParseError('');
    const { headers: hdrs, rows } = parseCsv(text);
    if (hdrs.length === 0 || rows.length === 0) {
      setParseError('No rows found. Make sure the file is a CSV with a header row and at least one data row.');
      return;
    }
    setFileName(name);
    setHeaders(hdrs);
    setDataRows(rows);
    setColumnRoles(autoAssignRoles(hdrs));
    if (!tag) {
      const base = name.replace(/\.csv$/i, '').slice(0, 60);
      setTag(base || 'Imported contacts');
    }
    setStep('map');
  }, [tag]);

  const handleFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => ingestText(String(reader.result || ''), file.name);
    reader.onerror = () => setParseError('Could not read that file.');
    reader.readAsText(file);
  }, [ingestText]);

  const setRole = (idx: number, role: ColumnRole) => {
    setColumnRoles(prev => {
      const next = [...prev];
      // Unique roles can only belong to one column — clear any other holder.
      if (UNIQUE_ROLES.includes(role)) {
        for (let i = 0; i < next.length; i++) if (next[i] === role) next[i] = 'extra';
      }
      next[idx] = role;
      return next;
    });
  };

  const emailColIdx = columnRoles.findIndex(r => r === 'email');
  const nameColIdx = columnRoles.findIndex(r => r === 'name');
  const firstColIdx = columnRoles.findIndex(r => r === 'first_name');
  const lastColIdx = columnRoles.findIndex(r => r === 'last_name');

  // Build the deduped contact list from the mapping.
  const parsedContacts = useMemo(() => {
    if (emailColIdx < 0) return { valid: [] as Array<{ name: string; email: string; extraFields: Record<string, string>; valid: boolean }>, duplicates: 0, noEmail: 0 };
    const seen = new Set<string>();
    let duplicates = 0;
    let noEmail = 0;
    const out: Array<{ name: string; email: string; extraFields: Record<string, string>; valid: boolean }> = [];
    for (const row of dataRows) {
      const email = (row[emailColIdx] || '').trim();
      if (!email) { noEmail++; continue; }
      const key = email.toLowerCase();
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      let name = nameColIdx >= 0 ? (row[nameColIdx] || '').trim() : '';
      if (!name) {
        const fn = firstColIdx >= 0 ? (row[firstColIdx] || '').trim() : '';
        const ln = lastColIdx >= 0 ? (row[lastColIdx] || '').trim() : '';
        name = [fn, ln].filter(Boolean).join(' ');
      }
      const extraFields: Record<string, string> = {};
      columnRoles.forEach((role, i) => {
        if (role === 'extra') {
          const v = (row[i] || '').trim();
          if (v) extraFields[headers[i] || `col_${i}`] = v;
        }
      });
      out.push({ name, email, extraFields, valid: isValidEmail(email) });
    }
    return { valid: out, duplicates, noEmail };
  }, [dataRows, columnRoles, emailColIdx, nameColIdx, firstColIdx, lastColIdx, headers]);

  const validCount = parsedContacts.valid.filter(c => c.valid).length;
  const invalidCount = parsedContacts.valid.length - validCount;

  // Available placeholders for the compose step.
  const placeholderKeys = useMemo(() => {
    const base = ['name', 'email', 'first_name', 'last_name'];
    if (isInvite) base.push('event', 'registration_link');
    const extra = new Set<string>();
    const sample = items[0]?.extraFields || parsedContacts.valid[0]?.extraFields || {};
    for (const k of Object.keys(sample)) extra.add(placeholderKey(k));
    return [...base, ...Array.from(extra)];
  }, [items, parsedContacts, isInvite]);

  const previewVars = useMemo(() => {
    const sample = items[0] || parsedContacts.valid.find(c => c.valid);
    const base = sample
      ? contactVars(sample)
      : { name: 'Jane Doe', email: 'jane@example.com', first_name: 'Jane', last_name: 'Doe' };
    // Show a representative link in the preview so the CTA isn't blank; the real
    // per-contact link is substituted server-side at send time.
    if (isInvite) {
      base.registration_link = formId ? `${window.location.origin}/#/form/${formId}?invite=…` : '(select a form)';
      base.event = selectedForm?.title || 'the event';
    }
    return base;
  }, [items, parsedContacts, isInvite, formId, selectedForm]);

  // Invite previews/sends render from the settings template (inviteBody HTML);
  // campaigns render from the structured compose fields.
  const renderedPreview = useMemo(
    () => isInvite
      ? renderEmailShell({ content: mergePlaceholders(inviteBody, previewVars), site: CURRENT_SITE.key, previewMode: true })
      : renderHtml(fields, previewVars, { previewMode: true }),
    [isInvite, inviteBody, fields, previewVars],
  );
  const renderedSubject = useMemo(() => mergePlaceholders(subject, previewVars), [subject, previewVars]);

  // ── import (create batch + rows) ──
  const doImport = async () => {
    setImporting(true);
    setParseError('');
    try {
      // Import only rows with a valid email — rows with a malformed/missing
      // email can never be emailed and there's no in-app way to edit them, so
      // importing them would just be un-actionable clutter. The review screen
      // counts them as excluded.
      // Import-time tags: the typed chips plus the batch tag/label, so every
      // imported row is filterable by its list name out of the box.
      const batchTag = tag.trim();
      const rowTags = Array.from(new Set([...importTags, ...(batchTag ? [batchTag] : [])]));
      const toImport = parsedContacts.valid
        .filter(c => c.valid)
        .map(c => ({ name: c.name, email: c.email, extraFields: c.extraFields, tags: rowTags }));
      const { contacts } = await createImportBatch({
        label: batchTag || 'Imported contacts',
        tag: batchTag || 'imported',
        sourceFilename: fileName || null,
        contacts: toImport,
      });
      setItems(contacts.map(c => ({ id: c.id, name: c.name, email: c.email, extraFields: c.extraFields, status: c.emailStatus, error: c.emailError })));
      setStep('compose');
    } catch (e: any) {
      setParseError(e?.message || 'Failed to import contacts.');
    } finally {
      setImporting(false);
    }
  };

  // ── send one ──
  const sendOne = async (item: SendItem): Promise<void> => {
    if (!isValidEmail(item.email)) {
      setItemsSafe(prev => prev.map(i => i.id === item.id ? { ...i, status: 'skipped', error: 'Invalid email address' } : i));
      await updateContactEmailStatus(item.id, { emailStatus: 'skipped', emailError: 'Invalid email address' });
      return;
    }
    // Campaign sends are claimed atomically (pending|failed → sending) so a
    // concurrent or cross-session run can't email the same contact twice.
    // Invite sends DON'T use this claim: the shared email_status column may
    // already read 'sent' from a prior campaign, which would wrongly skip the
    // invite. Invite idempotency lives server-side instead — contact-invite-
    // claim returns 409 once a contact has registered, and re-sending the same
    // valid link to an un-registered contact is a harmless reminder.
    if (!isInvite) {
      const claimed = await claimContactForSend(item.id);
      if (!claimed) {
        setItemsSafe(prev => prev.map(i => i.id === item.id ? { ...i, status: 'skipped', error: 'Already sent or in progress' } : i));
        return;
      }
    }
    setItemsSafe(prev => prev.map(i => i.id === item.id ? { ...i, status: 'sending', error: null } : i));
    const trackingId = generateTrackingId();
    // Resolve {{event}} client-side for invites; {{registration_link}} is left
    // INTACT so contact-invite-send can substitute the per-recipient link.
    const vars = isInvite
      ? { ...contactVars(item), event: selectedForm?.title || 'the event' }
      : contactVars(item);
    const subjectResolved = mergePlaceholders(subject, vars);
    // Invite: render the admin-managed template body (registration_link survives
    // to the server). Campaign: render the structured compose fields.
    const html = isInvite
      ? renderEmailShell({ content: mergePlaceholders(inviteBody, vars), site: CURRENT_SITE.key })
      : renderHtml(fields, vars, { trackingId });
    try {
      const { data, error } = isInvite
        ? await supabase.functions.invoke('contact-invite-send', {
            body: {
              contactId: item.id,
              formId,
              origin: window.location.origin,
              subject: subjectResolved,
              html,
            },
          })
        : await supabase.functions.invoke('send-ticket-email', {
            body: {
              mode: 'raw-html',
              to: item.email,
              subject: subjectResolved,
              html,
              smtpConfig: {
                host: settings.smtpHost || 'smtp.ionos.com',
                port: Number(settings.smtpPort || 587),
                user: settings.smtpUser,
                pass: settings.smtpPass,
                fromName: settings.emailFromName || '',
              },
            },
          });
      if (error) throw new Error(error.message || 'Send failed');
      if ((data as any)?.error) throw new Error((data as any).error);

      const sentAt = new Date().toISOString();
      setItemsSafe(prev => prev.map(i => i.id === item.id ? { ...i, status: 'sent', error: null } : i));
      // Invites are decoupled from campaign email_status: the contact-invite-send
      // edge fn already stamped invite_sent_at server-side. Writing 'sent' here
      // would drop the contact from later marketing campaigns. Campaign sends
      // persist email_status as before.
      if (!isInvite) {
        await updateContactEmailStatus(item.id, { emailStatus: 'sent', emailSentAt: sentAt, emailSubject: subjectResolved, trackingId, emailError: null });
      }
      // Log to email_sends for unified analytics/history (best-effort).
      try {
        const { data: { user } } = await supabase.auth.getUser();
        await logEmailSend({
          trackingId,
          recipientEmail: item.email,
          subject: subjectResolved,
          templateKey: isInvite ? 'contact-invite' : 'bulk',
          eventName: tag || presetAudience?.label || null,
          sentBy: user?.id ?? null,
          metadata: {
            source: isInvite ? 'contact-invite' : 'bulk-import',
            tag: tag || presetAudience?.label || '',
            ...(isInvite ? { formId } : {}),
          },
        });
      } catch { /* analytics logging is best-effort */ }
    } catch (e: any) {
      const msg = e?.message || 'Send failed';
      setItemsSafe(prev => prev.map(i => i.id === item.id ? { ...i, status: 'failed', error: msg } : i));
      // Leave email_status untouched for invites (decoupled from campaigns) —
      // a failed invite must not mark the contact 'failed' for marketing sends.
      if (!isInvite) {
        await updateContactEmailStatus(item.id, { emailStatus: 'failed', emailError: msg });
      }
    }
  };

  // Run a list of items with bounded concurrency.
  const runChunk = async (chunk: SendItem[], concurrency: number) => {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(concurrency, chunk.length) }, async () => {
      while (true) {
        if (cancelRef.current) return;
        // Claim an index synchronously (no await between read and increment) so
        // two workers never grab the same item.
        const idx = cursor++;
        if (idx >= chunk.length) return;
        await sendOne(chunk[idx]);
      }
    });
    await Promise.all(workers);
  };

  const startSend = async (onlyFailedOrPending: boolean) => {
    setStep('send');
    setRunning(true);
    setFinished(false);
    cancelRef.current = false;

    // Recompute the queue from current state so retries pick up only the
    // unsent rows. `sent` is never re-sent; skipped (invalid) are not retried.
    //
    // Invite mode is decoupled from campaign email_status: items were seeded to
    // 'pending' (never the persisted campaign status), so the same in-run filter
    // sends to ALL selected contacts on the first pass — a contact with a prior
    // campaign 'sent' is NOT skipped — and only failed/pending on retry.
    const queue = items.filter(i =>
      onlyFailedOrPending ? (i.status === 'pending' || i.status === 'failed') : (i.status !== 'sent'),
    );
    const size = Math.max(1, Math.min(batchSize, 500));
    const pauseMs = Math.max(0, pauseSeconds) * 1000;
    // Modest in-batch concurrency — the batch + pause is the primary throttle;
    // this just keeps a handful of connections open at once, not a flood.
    const concurrency = Math.min(3, size);

    for (let i = 0; i < queue.length; i += size) {
      if (cancelRef.current) break;
      const chunk = queue.slice(i, i + size);
      await runChunk(chunk, concurrency);
      const hasMore = i + size < queue.length;
      if (hasMore && !cancelRef.current && pauseMs > 0) {
        // Visible countdown between batches so the operator sees the cadence.
        for (let s = Math.ceil(pauseMs / 1000); s > 0; s--) {
          if (cancelRef.current) break;
          setCountdown(s);
          await sleep(1000);
        }
        setCountdown(0);
      }
    }
    if (!mountedRef.current) { onComplete?.(); return; }
    setRunning(false);
    setFinished(true);
    setCountdown(0);
    onComplete?.();
  };

  const cancelSend = () => { cancelRef.current = true; };

  const counts = useMemo(() => {
    const c = { total: items.length, sent: 0, failed: 0, skipped: 0, pending: 0, sending: 0 };
    for (const i of items) {
      if (i.status === 'sent') c.sent++;
      else if (i.status === 'failed') c.failed++;
      else if (i.status === 'skipped') c.skipped++;
      else if (i.status === 'sending') c.sending++;
      else c.pending++;
    }
    return c;
  }, [items]);

  const sendableRemaining = counts.pending + counts.failed;

  // Invite mode requires a target form and a {{registration_link}} somewhere in
  // the email, otherwise the recipient has no way to reach the registration.
  const inviteLinkPresent = /\{\{\s*registration_link\s*\}\}/.test(inviteBody);
  const composeDisabledReason: string | null = !smtpReady
    ? 'Configure SMTP in Settings to enable sending'
    : !subject.trim()
      ? 'Add a subject line'
      : !fields.message.trim()
        ? 'Add a message'
        : items.length === 0
          ? 'No recipients'
          : isInvite && !formId
            ? 'Choose a form to register for'
            : isInvite && !inviteLinkPresent
              ? 'Add the {{registration_link}} placeholder (e.g. as the CTA URL)'
              : null;
  const canSend = composeDisabledReason === null;

  // Guard against closing mid-send.
  const requestClose = () => {
    if (running) {
      const ok = window.confirm('Emails are still sending. Closing now will stop the run after the current batch. Close anyway?');
      if (!ok) return;
      cancelRef.current = true;
    }
    onClose();
  };

  // ── UI ──
  const labelCls = 'block text-[11px] font-semibold text-gray-600 mb-1.5 uppercase tracking-wider';
  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm transition';

  const STEP_LABELS: Array<{ key: Step; label: string }> = isResume
    ? [{ key: 'compose', label: 'Compose' }, { key: 'send', label: 'Review & send' }]
    : [
        { key: 'upload', label: 'Audience' },
        { key: 'map', label: 'Map columns' },
        { key: 'review', label: 'Review import' },
        { key: 'compose', label: 'Compose' },
        { key: 'send', label: 'Review & send' },
      ];
  const stepIndex = STEP_LABELS.findIndex(s => s.key === step);

  const modalTitle = isInvite
    ? 'Invite contacts to register'
    : isResume
      ? 'Send campaign'
      : 'Bulk import contacts';
  const modalSubtitle = isInvite
    ? `Email a free-registration link to ${items.length} contact${items.length !== 1 ? 's' : ''}`
    : isResume
      ? presetAudience?.label || 'Selected contacts'
      : 'Upload a CSV, map columns, then email everyone';
  const HeaderIcon = isInvite ? Ticket : FileSpreadsheet;

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={requestClose}>
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="text-white" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 55%, #2260a1 100%)' }}>
          <div className="px-6 pt-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/15 rounded-lg"><HeaderIcon className="w-5 h-5" /></div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">{modalTitle}</h2>
                <p className="text-xs text-white/85 mt-0.5">{modalSubtitle}</p>
              </div>
            </div>
            <button onClick={requestClose} className="p-1.5 rounded-full hover:bg-white/20 transition" aria-label="Close"><X className="w-5 h-5 text-white" /></button>
          </div>
          {/* Stepper */}
          <div className="px-6 mt-3 pb-3 flex items-center gap-2 text-[11px] font-semibold">
            {STEP_LABELS.map((s, i) => (
              <React.Fragment key={s.key}>
                <span className={`px-2.5 py-1 rounded-full ${i === stepIndex ? 'bg-white text-indigo-700' : i < stepIndex ? 'bg-white/30 text-white' : 'bg-white/10 text-white/70'}`}>
                  {i < stepIndex ? <CheckCircle2 className="w-3 h-3 inline mr-1 -mt-0.5" /> : null}{s.label}
                </span>
                {i < STEP_LABELS.length - 1 && <ArrowRight className="w-3 h-3 text-white/50" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {/* STEP: upload */}
          {step === 'upload' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileInputRef.current?.click()}
                className={`cursor-pointer border-2 border-dashed rounded-2xl p-12 text-center transition ${dragOver ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'}`}
              >
                <Upload className="w-12 h-12 mx-auto mb-3 text-indigo-400" />
                <p className="text-base font-semibold text-gray-800">Drop a CSV here, or click to browse</p>
                <p className="text-sm text-gray-500 mt-1">The first row must be a header (e.g. Name, Email). Other columns are kept as extra fields.</p>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
              </div>
              {parseError && <div className="mt-4 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />{parseError}</div>}
              <div className="mt-6 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="font-semibold text-gray-700 mb-1">Tip</p>
                We'll try to detect the Name and Email columns automatically. You can fix the mapping on the next screen, and choose which extra columns to keep for use as <code className="bg-gray-200 px-1 rounded">{'{{placeholders}}'}</code> in your email.
              </div>
            </div>
          )}

          {/* STEP: map */}
          {step === 'map' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-500" />
                  <span className="font-medium text-gray-800">{fileName}</span>
                  <span className="text-gray-400">·</span>
                  <span>{dataRows.length} rows · {headers.length} columns</span>
                </div>
                <button onClick={() => setColumnRoles(autoAssignRoles(headers))} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                  <RefreshCw className="w-3 h-3" /> Re-run auto-match
                </button>
              </div>

              {emailColIdx < 0 && (
                <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Assign one column to <strong>Email</strong> to continue.
                </div>
              )}

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold w-1/3">CSV column</th>
                      <th className="text-left px-4 py-2 font-semibold w-1/3">Import as</th>
                      <th className="text-left px-4 py-2 font-semibold">Sample</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {headers.map((h, idx) => {
                      const sample = dataRows.slice(0, 3).map(r => r[idx]).filter(Boolean).join(', ');
                      const role = columnRoles[idx];
                      return (
                        <tr key={idx} className={role === 'ignore' ? 'opacity-50' : ''}>
                          <td className="px-4 py-2 font-medium text-gray-800">{h || <span className="text-gray-400 italic">column {idx + 1}</span>}</td>
                          <td className="px-4 py-2">
                            <div className="relative inline-block">
                              <select
                                value={role}
                                onChange={e => setRole(idx, e.target.value as ColumnRole)}
                                className={`appearance-none pr-8 pl-3 py-1.5 rounded-md text-xs font-medium border outline-none focus:ring-2 focus:ring-indigo-500/30 ${UNIQUE_ROLES.includes(role) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : role === 'extra' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                              >
                                {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                              <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[260px]" title={sample}>{sample || <span className="text-gray-300">—</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP: review */}
          {step === 'review' && (
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ReviewStat label="Ready to import" value={validCount} tint="emerald" icon={<CheckCircle2 className="w-4 h-4" />} />
                <ReviewStat label="Invalid (excluded)" value={invalidCount} tint="amber" icon={<AlertTriangle className="w-4 h-4" />} />
                <ReviewStat label="Duplicates removed" value={parsedContacts.duplicates} tint="slate" icon={<Users className="w-4 h-4" />} />
                <ReviewStat label="No email (skipped)" value={parsedContacts.noEmail} tint="slate" icon={<XCircle className="w-4 h-4" />} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}><Tag className="w-3 h-3 inline mr-1 -mt-0.5" /> Tag / list name <span className="normal-case tracking-normal text-gray-400 font-normal">— used to filter these contacts</span></label>
                  <input value={tag} onChange={e => setTag(e.target.value)} className={inputCls} placeholder="e.g. Newsletter June 2026" />
                </div>
                <div>
                  <label className={labelCls} htmlFor="import-tags-input">Tags <span className="normal-case tracking-normal text-gray-400 font-normal">— extra labels applied to every row</span></label>
                  <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/30 focus-within:border-indigo-500 transition min-h-[42px]">
                    {importTags.map(t => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium">
                        {t}
                        <button type="button" onClick={() => setImportTags(prev => prev.filter(x => x !== t))} className="hover:text-indigo-900" aria-label={`Remove tag ${t}`}><X className="w-3 h-3" /></button>
                      </span>
                    ))}
                    <input
                      id="import-tags-input"
                      value={importTagDraft}
                      onChange={e => setImportTagDraft(e.target.value)}
                      onKeyDown={e => {
                        if ((e.key === 'Enter' || e.key === ',') && importTagDraft.trim()) {
                          e.preventDefault();
                          const v = importTagDraft.trim();
                          setImportTags(prev => prev.includes(v) ? prev : [...prev, v]);
                          setImportTagDraft('');
                        } else if (e.key === 'Backspace' && !importTagDraft && importTags.length) {
                          setImportTags(prev => prev.slice(0, -1));
                        }
                      }}
                      onBlur={() => {
                        const v = importTagDraft.trim();
                        if (v) { setImportTags(prev => prev.includes(v) ? prev : [...prev, v]); setImportTagDraft(''); }
                      }}
                      className="flex-1 min-w-[100px] outline-none text-sm bg-transparent"
                      placeholder={importTags.length ? 'Add another…' : 'Type a tag, press Enter'}
                    />
                  </div>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Name</th>
                      <th className="text-left px-4 py-2 font-semibold">Email</th>
                      <th className="text-left px-4 py-2 font-semibold">Extra fields</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {parsedContacts.valid.slice(0, 100).map((c, i) => (
                      <tr key={i} className={!c.valid ? 'bg-amber-50/50' : ''}>
                        <td className="px-4 py-2 text-gray-800">{c.name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2 text-gray-700">
                          {c.email}
                          {!c.valid && <span className="ml-2 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">excluded</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[280px]" title={Object.entries(c.extraFields).map(([k, v]) => `${k}: ${v}`).join(' · ')}>
                          {Object.keys(c.extraFields).length ? Object.entries(c.extraFields).map(([k, v]) => `${k}: ${v}`).join(' · ') : <span className="text-gray-300">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedContacts.valid.length > 100 && (
                  <div className="px-4 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-100">Showing first 100 of {parsedContacts.valid.length}. All will be imported.</div>
                )}
              </div>
              {parseError && <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{parseError}</div>}
              <p className="text-xs text-gray-500">Rows with an invalid or missing email are excluded from the import and won't be sent.</p>
            </div>
          )}

          {/* STEP: compose */}
          {step === 'compose' && (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {/* Mobile-only Compose | Preview toggle (side-by-side on lg+) */}
              <div className="lg:hidden flex gap-1 p-1 mx-3 mt-3 bg-gray-100 rounded-lg shrink-0">
                {(['compose', 'preview'] as const).map(v => (
                  <button key={v} type="button" onClick={() => setMobileView(v)}
                    className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition ${mobileView === v ? 'bg-white shadow text-indigo-700' : 'text-gray-500'}`}>
                    {v === 'compose' ? 'Compose' : 'Preview'}
                  </button>
                ))}
              </div>
              <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 overflow-hidden min-h-0">
              <div className={`${mobileView === 'compose' ? '' : 'hidden'} lg:block lg:col-span-2 overflow-y-auto px-6 py-5 space-y-4 border-r border-gray-100`}>
                {/* Audience summary */}
                <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700 flex items-center gap-2">
                  <Users className="w-4 h-4 shrink-0" />
                  <span><strong>{items.length}</strong> recipient{items.length !== 1 ? 's' : ''}{(tag || presetAudience?.label) ? <> in <strong>{tag || presetAudience?.label}</strong></> : null}</span>
                </div>

                {/* Invite mode — target form picker */}
                {isInvite && (
                  <div>
                    <label className={labelCls} htmlFor="invite-form-picker"><Ticket className="w-3 h-3 inline mr-1 -mt-0.5" /> Register for</label>
                    <div className="relative">
                      <select
                        id="invite-form-picker"
                        value={formId}
                        onChange={e => setFormId(e.target.value)}
                        disabled={formsLoading}
                        className={`${inputCls} appearance-none pr-9 disabled:opacity-60`}
                      >
                        {formsLoading && <option>Loading forms…</option>}
                        {!formsLoading && forms.length === 0 && <option value="">No forms available</option>}
                        {!formsLoading && forms.map(f => (
                          <option key={f.id} value={f.id}>{f.title}{f.status !== 'active' ? ` (${f.status})` : ''}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                    <p className="mt-1.5 text-[11px] text-gray-500 flex items-start gap-1">
                      <Link2 className="w-3 h-3 mt-0.5 shrink-0" />
                      Each contact gets a unique <code className="bg-gray-100 px-1 rounded">{'{{registration_link}}'}</code> to <strong>{selectedForm?.title || 'this form'}</strong> — prefilled, free, no payment.
                    </p>
                  </div>
                )}
                {!smtpReady && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> SMTP isn't configured in Settings — sending is disabled. Your contacts are already saved; you can send later from the Contacts tab.
                  </div>
                )}
                <div>
                  <label className={labelCls}>Subject</label>
                  <input value={subject} onChange={e => setSubject(e.target.value)} className={inputCls} placeholder="Subject line" />
                </div>
                {isInvite ? (
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2.5 text-xs text-gray-600 flex items-start gap-2">
                    <Mail className="w-4 h-4 shrink-0 mt-0.5 text-indigo-500" />
                    <span>
                      The email body comes from your <strong>Contact Invitation</strong> template — edit the wording, heading and button in
                      {' '}<strong>Settings → Email Templates</strong>. The preview on the right shows exactly what each contact receives.
                    </span>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className={labelCls}>Heading</label>
                      <input value={fields.heading} onChange={e => setFields(f => ({ ...f, heading: e.target.value }))} className={inputCls} placeholder="Large heading" />
                    </div>
                    <div>
                      <label className={labelCls}>Message</label>
                      <textarea value={fields.message} onChange={e => setFields(f => ({ ...f, message: e.target.value }))} rows={7} className={`${inputCls} leading-relaxed`} placeholder="Plain text. Blank lines = paragraph breaks." />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>CTA label</label>
                        <input value={fields.ctaLabel} onChange={e => setFields(f => ({ ...f, ctaLabel: e.target.value }))} className={inputCls} placeholder="(optional)" />
                      </div>
                      <div>
                        <label className={labelCls}>CTA URL</label>
                        <input value={fields.ctaUrl} onChange={e => setFields(f => ({ ...f, ctaUrl: e.target.value }))} className={inputCls} placeholder="https://…" />
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Footer note</label>
                      <textarea value={fields.footerNote} onChange={e => setFields(f => ({ ...f, footerNote: e.target.value }))} rows={2} className={inputCls} />
                    </div>
                  </>
                )}
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                  <div className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider mb-2">Available placeholders</div>
                  <div className="flex flex-wrap gap-1.5">
                    {placeholderKeys.map(k => (
                      <code key={k} className="text-[11px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-700 font-mono">{'{{'}{k}{'}}'}</code>
                    ))}
                  </div>
                </div>
              </div>
              {/* Preview */}
              <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} lg:flex lg:col-span-3 bg-gray-100 flex-col min-h-0`}>
                <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between shrink-0">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Preview</div>
                  <div className="text-[11px] text-gray-500 truncate max-w-[60%]" title={renderedSubject}>Subject: <span className="font-medium text-gray-700">{renderedSubject || <em className="text-gray-400">(empty)</em>}</span></div>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <iframe title="Email preview" srcDoc={renderedPreview} sandbox="" className="w-full h-full min-h-[60vh] lg:min-h-0 bg-white border-0 block" />
                </div>
              </div>
            </div>
            </div>
          )}

          {/* STEP: send */}
          {step === 'send' && (
            <div className="flex-1 overflow-hidden flex flex-col">
              {/* Summary bar */}
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 flex-wrap">
                    <SendCount label="Sent" value={counts.sent} total={counts.total} tint="emerald" />
                    <SendCount label="Failed" value={counts.failed} tint="red" />
                    <SendCount label="Skipped" value={counts.skipped} tint="amber" />
                    <SendCount label="Pending" value={counts.pending + counts.sending} tint="slate" />
                  </div>
                  <div className="text-sm">
                    {running ? (
                      <span className="inline-flex items-center gap-2 text-indigo-700 font-medium">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {countdown > 0 ? `Pausing ${countdown}s before next batch…` : 'Sending…'}
                      </span>
                    ) : finished ? (
                      <span className="inline-flex items-center gap-2 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        {counts.sent} of {counts.total} email{counts.total !== 1 ? 's' : ''} sent
                        {counts.failed > 0 ? ` · ${counts.failed} failed` : ''}
                      </span>
                    ) : null}
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div className="h-full bg-emerald-500 transition-all" style={{ width: `${counts.total ? Math.round(((counts.sent + counts.failed + counts.skipped) / counts.total) * 100) : 0}%` }} />
                </div>
              </div>
              {/* Recipient list */}
              <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white sticky top-0 text-gray-500 text-xs uppercase tracking-wide border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-2 font-semibold">Status</th>
                      <th className="text-left px-4 py-2 font-semibold">Name</th>
                      <th className="text-left px-4 py-2 font-semibold">Email</th>
                      <th className="text-left px-4 py-2 font-semibold">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {items.map(i => (
                      <tr key={i.id} className={i.status === 'failed' ? 'bg-red-50/40' : i.status === 'sent' ? 'bg-emerald-50/30' : ''}>
                        <td className="px-6 py-2"><StatusBadge status={i.status} /></td>
                        <td className="px-4 py-2 text-gray-800">{i.name || <span className="text-gray-300">—</span>}</td>
                        <td className="px-4 py-2 text-gray-700">{i.email}</td>
                        <td className="px-4 py-2 text-xs text-gray-500 truncate max-w-[280px]" title={i.error || ''}>{i.error || (i.status === 'sent' ? 'Delivered to mail server' : '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between gap-2 bg-gray-50">
          <div className="text-[11px] text-gray-500">
            {step === 'send' && !isResume && <>Tag: <span className="font-medium text-gray-700">{tag}</span> · available later under the Contacts tab</>}
            {step === 'compose' && composeDisabledReason && (
              <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle className="w-3.5 h-3.5" /> {composeDisabledReason}</span>
            )}
            {step === 'compose' && !composeDisabledReason && <>Emails send in batches of {batchSize} with a {pauseSeconds}s pause — gentle on your mail server.</>}
          </div>
          <div className="flex items-center gap-2">
            {/* Back */}
            {step === 'map' && <NavBtn onClick={() => setStep('upload')} icon={<ArrowLeft className="w-4 h-4" />} label="Back" />}
            {step === 'review' && <NavBtn onClick={() => setStep('map')} icon={<ArrowLeft className="w-4 h-4" />} label="Back" />}
            {step === 'compose' && !isResume && <NavBtn onClick={() => setStep('review')} icon={<ArrowLeft className="w-4 h-4" />} label="Back" />}

            {/* Forward / actions */}
            {step === 'upload' && <button onClick={requestClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition">Cancel</button>}

            {step === 'map' && (
              <button onClick={() => setStep('review')} disabled={emailColIdx < 0} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                Review {validCount > 0 ? `(${validCount})` : ''} <ArrowRight className="w-4 h-4" />
              </button>
            )}

            {step === 'review' && (
              <button onClick={doImport} disabled={importing || validCount === 0} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition">
                {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing…</> : <>Import {validCount} & compose <ArrowRight className="w-4 h-4" /></>}
              </button>
            )}

            {step === 'compose' && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span>Batch</span>
                  <input type="number" min={1} max={500} value={batchSize} onChange={e => setBatchSize(Number(e.target.value) || 1)} className="w-16 px-2 py-1 border border-gray-300 rounded-md text-center" />
                  <span>every</span>
                  <input type="number" min={0} max={3600} value={pauseSeconds} onChange={e => setPauseSeconds(Number(e.target.value) || 0)} className="w-16 px-2 py-1 border border-gray-300 rounded-md text-center" />
                  <span>s</span>
                </div>
                <button
                  onClick={() => startSend(false)}
                  disabled={!canSend}
                  title={composeDisabledReason ?? undefined}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {isInvite ? <Ticket className="w-4 h-4" /> : <SendIcon className="w-4 h-4" />}
                  {isInvite ? `Send ${items.length} invite${items.length !== 1 ? 's' : ''}` : `Send to ${items.length}`}
                </button>
              </div>
            )}

            {step === 'send' && (
              <div className="flex items-center gap-2">
                {running ? (
                  <button onClick={cancelSend} className="px-4 py-2 rounded-lg text-sm font-medium text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 transition">Stop sending</button>
                ) : (
                  <>
                    {sendableRemaining > 0 && (
                      <button onClick={() => startSend(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 transition">
                        <RefreshCw className="w-4 h-4" /> Retry {counts.failed > 0 ? `${counts.failed} failed` : `${sendableRemaining} remaining`}
                      </button>
                    )}
                    <button onClick={() => { onComplete?.(); onClose(); }} className="px-5 py-2 rounded-lg text-sm font-bold text-white bg-gray-800 hover:bg-gray-900 transition">Done</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── small presentational helpers ──

function ReviewStat({ label, value, tint, icon }: { label: string; value: number; tint: 'emerald' | 'amber' | 'slate'; icon: React.ReactNode }) {
  const tints: Record<string, string> = {
    emerald: 'from-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'from-amber-50 text-amber-700 border-amber-200',
    slate: 'from-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br to-white p-3 ${tints[tint]}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1 leading-none">{value}</div>
    </div>
  );
}

function SendCount({ label, value, total, tint }: { label: string; value: number; total?: number; tint: 'emerald' | 'red' | 'amber' | 'slate' }) {
  const tints: Record<string, string> = {
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    red: 'text-red-700 bg-red-50 border-red-200',
    amber: 'text-amber-700 bg-amber-50 border-amber-200',
    slate: 'text-slate-600 bg-slate-50 border-slate-200',
  };
  return (
    <span className={`inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-semibold ${tints[tint]}`}>
      <span className="text-lg leading-none">{value}{total !== undefined ? <span className="text-xs font-normal opacity-60">/{total}</span> : null}</span>
      <span className="text-[11px] uppercase tracking-wide font-medium">{label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: ContactEmailStatus }) {
  switch (status) {
    case 'sent':
      return <span className="inline-flex items-center gap-1 text-emerald-700 font-medium text-xs"><CheckCircle2 className="w-4 h-4" /> Sent</span>;
    case 'failed':
      return <span className="inline-flex items-center gap-1 text-red-700 font-medium text-xs"><XCircle className="w-4 h-4" /> Failed</span>;
    case 'skipped':
      return <span className="inline-flex items-center gap-1 text-amber-700 font-medium text-xs"><AlertTriangle className="w-4 h-4" /> Skipped</span>;
    case 'sending':
      return <span className="inline-flex items-center gap-1 text-indigo-700 font-medium text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Sending</span>;
    default:
      return <span className="inline-flex items-center gap-1 text-gray-400 font-medium text-xs"><Circle className="w-4 h-4" /> Pending</span>;
  }
}

function NavBtn({ onClick, icon, label }: { onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 transition">{icon}{label}</button>
  );
}
