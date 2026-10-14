// Badge printing persistence: permanent registration codes and the history of
// print exports. Both go through SECURITY DEFINER functions so read-only
// viewer accounts (the registration vendor) can use the Badge Printing tab
// without any other write access — see the 20261014120000 migration.

import { supabase } from './supabaseClient';
import type { BadgeRegion, PrintRecord } from '../utils/badgeList';

export interface PrintExport {
  id: number;
  createdAt: string;
  createdByEmail: string | null;
  label: string | null;
  filters: Record<string, unknown>;
  rowCount: number;
}

/** Assigns codes to any of these rows that lack one; returns id → code. */
export async function assignRegCodes(items: Array<{ id: string; region: BadgeRegion }>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;
  const { data, error } = await supabase.rpc('assign_reg_codes', { p_items: items });
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ id: string; reg_code: string | null }>) {
    if (r.reg_code) out.set(r.id, r.reg_code);
  }
  return out;
}

export async function listPrintExports(): Promise<PrintExport[]> {
  const { data, error } = await supabase
    .from('print_exports')
    .select('id, created_at, created_by_email, label, filters, row_count')
    .order('id', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id,
    createdAt: r.created_at,
    createdByEmail: r.created_by_email ?? null,
    label: r.label ?? null,
    filters: r.filters ?? {},
    rowCount: r.row_count ?? 0,
  }));
}

/** attendee id → every print of them, newest first. */
export async function loadPrintHistory(exports: PrintExport[]): Promise<Map<string, PrintRecord[]>> {
  const byAttendee = new Map<string, PrintRecord[]>();
  if (exports.length === 0) return byAttendee;
  const createdAt = new Map(exports.map(e => [e.id, e.createdAt] as const));
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('print_export_rows')
      .select('export_id, attendee_id, fingerprint')
      .order('export_id', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ export_id: number; attendee_id: string; fingerprint: string }>) {
      const list = byAttendee.get(r.attendee_id) ?? [];
      list.push({ exportId: r.export_id, createdAt: createdAt.get(r.export_id) ?? '', fingerprint: r.fingerprint });
      byAttendee.set(r.attendee_id, list);
    }
    if (!data || data.length < pageSize) break;
  }
  return byAttendee;
}

export async function loadExportSnapshot(exportId: number): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase
    .from('print_export_rows')
    .select('snapshot')
    .eq('export_id', exportId);
  if (error) throw error;
  return (data ?? []).map((r: any) => r.snapshot ?? {});
}

export async function recordPrintExport(
  label: string,
  filters: Record<string, unknown>,
  rows: Array<{ attendee_id: string; fingerprint: string; snapshot: Record<string, unknown> }>,
): Promise<number> {
  const { data, error } = await supabase.rpc('record_print_export', { p_label: label, p_filters: filters, p_rows: rows });
  if (error) throw error;
  return Number(data);
}
