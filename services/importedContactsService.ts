import { supabase } from './supabaseClient';

// ---------------------------------------------------------------------------
// Bulk-imported contacts + import batches.
//
// Backs the admin "Contacts" tab and the Bulk Import modal. Imported contacts
// are a mailing list (name/email + arbitrary extra columns), distinct from
// `attendees` (registrations). Per-recipient email_status powers the modal's
// live green-check / failure tracking and lets an admin re-open a batch and
// retry only the rows that failed.
// ---------------------------------------------------------------------------

export type ContactEmailStatus = 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';

export interface ImportBatch {
  id: string;
  label: string;
  tag: string;
  sourceFilename: string | null;
  totalCount: number;
  createdAt: string;
  createdBy: string | null;
}

export interface ImportedContact {
  id: string;
  batchId: string | null;
  name: string;
  email: string;
  tag: string | null;
  extraFields: Record<string, string>;
  emailStatus: ContactEmailStatus;
  emailError: string | null;
  emailSubject: string | null;
  emailSentAt: string | null;
  trackingId: string | null;
  createdAt: string;
}

export interface NewContactInput {
  name: string;
  email: string;
  extraFields?: Record<string, string>;
}

function mapBatch(r: any): ImportBatch {
  return {
    id: r.id,
    label: r.label,
    tag: r.tag,
    sourceFilename: r.source_filename ?? null,
    totalCount: r.total_count ?? 0,
    createdAt: r.created_at,
    createdBy: r.created_by ?? null,
  };
}

function mapContact(r: any): ImportedContact {
  return {
    id: r.id,
    batchId: r.batch_id ?? null,
    name: r.name ?? '',
    email: r.email,
    tag: r.tag ?? null,
    extraFields: (r.extra_fields as Record<string, string>) ?? {},
    emailStatus: (r.email_status as ContactEmailStatus) ?? 'pending',
    emailError: r.email_error ?? null,
    emailSubject: r.email_subject ?? null,
    emailSentAt: r.email_sent_at ?? null,
    trackingId: r.tracking_id ?? null,
    createdAt: r.created_at,
  };
}

/**
 * Create an import batch and insert its contact rows. Contacts are chunked so
 * a large CSV doesn't exceed payload limits. Returns the batch plus the
 * inserted contacts (with their DB ids) so the caller can drive the send flow.
 */
export async function createImportBatch(params: {
  label: string;
  tag: string;
  sourceFilename: string | null;
  contacts: NewContactInput[];
}): Promise<{ batch: ImportBatch; contacts: ImportedContact[] }> {
  const { data: { user } } = await supabase.auth.getUser();
  const createdBy = user?.id ?? null;

  const { data: batchRow, error: batchErr } = await supabase
    .from('contact_import_batches')
    .insert({
      label: params.label,
      tag: params.tag,
      source_filename: params.sourceFilename,
      total_count: params.contacts.length,
      created_by: createdBy,
    })
    .select('*')
    .single();
  if (batchErr || !batchRow) {
    throw new Error(batchErr?.message || 'Failed to create import batch');
  }
  const batch = mapBatch(batchRow);

  const inserted: ImportedContact[] = [];
  const CHUNK = 500;
  try {
    for (let i = 0; i < params.contacts.length; i += CHUNK) {
      const slice = params.contacts.slice(i, i + CHUNK);
      const payload = slice.map(c => ({
        batch_id: batch.id,
        name: c.name || '',
        email: c.email,
        tag: params.tag,
        extra_fields: c.extraFields ?? {},
        created_by: createdBy,
      }));
      const { data, error } = await supabase
        .from('imported_contacts')
        .insert(payload)
        .select('*');
      if (error) throw new Error(error.message || 'Failed to insert contacts');
      inserted.push(...(data ?? []).map(mapContact));
    }
  } catch (e) {
    // Don't leave a half-populated, mislabeled batch behind (its total_count
    // would overstate the rows that actually landed). Roll it back — the FK
    // cascade removes any rows that did insert — then surface the error.
    await supabase.from('contact_import_batches').delete().eq('id', batch.id);
    throw e instanceof Error ? e : new Error('Failed to insert contacts');
  }
  return { batch, contacts: inserted };
}

export async function getImportBatches(): Promise<ImportBatch[]> {
  const { data, error } = await supabase
    .from('contact_import_batches')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getImportBatches failed', error);
    return [];
  }
  return (data ?? []).map(mapBatch);
}

export async function getImportedContacts(opts?: {
  batchId?: string;
  tag?: string;
  status?: ContactEmailStatus;
  limit?: number;
}): Promise<ImportedContact[]> {
  let query = supabase
    .from('imported_contacts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 5000);
  if (opts?.batchId) query = query.eq('batch_id', opts.batchId);
  if (opts?.tag) query = query.eq('tag', opts.tag);
  if (opts?.status) query = query.eq('email_status', opts.status);
  const { data, error } = await query;
  if (error) {
    console.error('getImportedContacts failed', error);
    return [];
  }
  return (data ?? []).map(mapContact);
}

/** Update a single contact's email send state. */
export async function updateContactEmailStatus(
  id: string,
  updates: {
    emailStatus: ContactEmailStatus;
    emailError?: string | null;
    emailSubject?: string | null;
    emailSentAt?: string | null;
    trackingId?: string | null;
  },
): Promise<void> {
  const patch: Record<string, unknown> = { email_status: updates.emailStatus };
  if (updates.emailError !== undefined) patch.email_error = updates.emailError;
  if (updates.emailSubject !== undefined) patch.email_subject = updates.emailSubject;
  if (updates.emailSentAt !== undefined) patch.email_sent_at = updates.emailSentAt;
  if (updates.trackingId !== undefined) patch.tracking_id = updates.trackingId;
  const { error } = await supabase
    .from('imported_contacts')
    .update(patch)
    .eq('id', id);
  if (error) {
    // Bookkeeping only — the email already went out. Log but don't throw so a
    // transient update failure doesn't abort the rest of the campaign.
    console.error('updateContactEmailStatus failed', error);
  }
}

/**
 * Atomically claim a contact for sending: flip 'pending'|'failed' → 'sending'.
 * Returns true only if THIS call won the row (the conditional UPDATE matched).
 *
 * This is the idempotency guard for the email campaign. Sending is driven from
 * the client, so two overlapping runs (two admins, two tabs, a retry that
 * races an in-flight run) could otherwise both pick the same 'pending' row and
 * email it twice. By claiming first — and never auto-retrying a 'sending' or
 * 'sent' row — we get at-most-once delivery. A row stuck on 'sending' (process
 * died after send, before the 'sent' write) is intentionally NOT re-sent.
 */
export async function claimContactForSend(id: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('imported_contacts')
    .update({ email_status: 'sending', email_error: null })
    .eq('id', id)
    .in('email_status', ['pending', 'failed'])
    .select('id');
  if (error) {
    // On a transient error, refuse the claim rather than risk a double-send.
    // The DB status is unchanged (still pending/failed) so a later retry can
    // pick it up cleanly.
    console.error('claimContactForSend failed', error);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function deleteImportBatch(batchId: string): Promise<void> {
  // Child contacts cascade via the FK ON DELETE CASCADE.
  const { error } = await supabase
    .from('contact_import_batches')
    .delete()
    .eq('id', batchId);
  if (error) throw new Error(error.message || 'Failed to delete batch');
}

export async function deleteImportedContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('imported_contacts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message || 'Failed to delete contact');
}
