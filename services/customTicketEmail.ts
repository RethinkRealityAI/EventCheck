// Admin "custom ticket email": admin-written copy wrapped around each
// recipient's real ticket. Server: send-ticket-email mode 'custom-ticket'
// (admin-only — supabase.functions.invoke attaches the admin's session).

import { supabase } from './supabaseClient';
import { extractInvokeError } from '../utils/emailSendErrors';

export interface CustomTicketPreview {
  to: string;
  subject: string;
  html: string;
  attachments: string[];
  flags: { has_account: boolean; is_companion: boolean; has_companions: boolean };
  companions: string[];
}

export type CustomTicketResult =
  | { attendeeId: string; status: 'sent'; to: string }
  | { attendeeId: string; status: 'failed'; reason: string };

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('send-ticket-email', {
    body: { mode: 'custom-ticket', origin: window.location.origin, ...body },
  });
  if (error) throw new Error(await extractInvokeError(error));
  if ((data as any)?.error) throw new Error(String((data as any).error));
  return data as T;
}

export async function previewCustomTicket(attendeeId: string, subject: string, body: string): Promise<CustomTicketPreview> {
  const data = await invoke<{ preview: CustomTicketPreview }>({ attendeeId, subject, body, preview: true });
  return data.preview;
}

/**
 * One request per recipient, in sequence: each builds several PDFs server-side,
 * and a failure should name the person it happened to without stopping the rest.
 */
export async function sendCustomTickets(
  attendeeIds: string[],
  subject: string,
  body: string,
  onProgress?: (results: CustomTicketResult[]) => void,
): Promise<CustomTicketResult[]> {
  const results: CustomTicketResult[] = [];
  for (const attendeeId of attendeeIds) {
    try {
      const data = await invoke<{ to: string }>({ attendeeId, subject, body });
      results.push({ attendeeId, status: 'sent', to: data.to });
    } catch (e) {
      results.push({ attendeeId, status: 'failed', reason: (e as Error).message });
    }
    onProgress?.([...results]);
  }
  return results;
}

export { CUSTOM_TICKET_PRESETS, type CustomTicketPreset } from '../utils/customTicketPresets';
