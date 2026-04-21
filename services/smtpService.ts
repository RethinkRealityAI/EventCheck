import { supabase } from './supabaseClient';
import { AppSettings } from '../types';

/**
 * Attachment interface for email attachments.
 * Content should be a base64-encoded string for transport over HTTP.
 */
export interface Attachment {
  filename: string;
  content: string; // base64-encoded PDF content
  contentType?: string;
}

/**
 * Mode-discriminated argument shapes accepted by the `send-ticket-email` edge function.
 * The existing default-mode path (ticket email with PDF attachment) goes through
 * `sendTicketEmail` below; these shapes are for callers that invoke the edge function
 * directly with `supabase.functions.invoke('send-ticket-email', { body: {...} })`.
 *
 * Adding these as typed shapes keeps the edge-function contract discoverable from
 * TypeScript without changing the runtime call pattern.
 */
export type StaffInviteArgs = {
  mode: 'staff-invite';
  to: string;
  name: string;
  purchaser: string;
  orgName: string;
  category: 'Hall-Only' | 'Full-Access' | 'Sponsor Seat';
  completeUrl: string;
  signupUrl: string;
  eventName: string;
};

export type StaffConfirmedArgs = {
  mode: 'staff-claim-completed';
  to: string;
  name: string;
  orgName: string;
  eventName: string;
  attachments: Array<{ filename: string; content: string }>; // base64
};

export type SendTicketEmailArgs = StaffInviteArgs | StaffConfirmedArgs;

/**
 * Convert an ArrayBuffer (e.g. from jsPDF) to a base64 string
 * that can be safely sent over HTTP to the Edge Function.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Send a ticket email via the Supabase Edge Function.
 * 
 * This function packages the email data (including base64-encoded PDF attachments)
 * and sends it to the `send-ticket-email` Edge Function which handles SMTP delivery
 * server-side using nodemailer.
 * 
 * Falls back silently if SMTP is not configured (no smtpUser/smtpPass in settings).
 */
export async function sendTicketEmail(settings: AppSettings, data: {
  to: string;
  subject: string;
  name: string;
  message: string;
  attachments?: Attachment[];
}): Promise<void> {
  if (!settings.smtpUser || !settings.smtpPass) {
    console.warn('SMTP credentials not configured — skipping email send.');
    return;
  }

  const { data: responseData, error, response } = await supabase.functions.invoke('send-ticket-email', {
    body: {
      smtpConfig: {
        host: settings.smtpHost || 'smtp.ionos.com',
        port: Number(settings.smtpPort || 587),
        user: settings.smtpUser,
        pass: settings.smtpPass,
        fromName: settings.emailFromName || '',
      },
      email: {
        to: data.to,
        subject: data.subject,
        name: data.name,
        message: data.message,
        attachments: data.attachments || [],
      }
    },
  }) as { data: any; error: any; response?: Response };

  if (error) {
    // Non-2xx from the edge function. supabase-js wraps the body, but we can
    // read it off `response` to surface the real message (e.g. SMTP auth failed).
    let detail = error.message || 'Failed to invoke send-ticket-email function';
    try {
      const body = await response?.clone().json();
      if (body?.error) detail = `SMTP error: ${body.error}`;
    } catch {
      /* body wasn't JSON */
    }
    console.error('Error invoking send-ticket-email function:', detail);
    throw new Error(detail);
  }

  if (responseData?.error) {
    throw new Error(responseData.error);
  }
}
