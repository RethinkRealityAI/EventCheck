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

  const { data: responseData, error } = await supabase.functions.invoke('send-ticket-email', {
    body: {
      smtpConfig: {
        host: settings.smtpHost || 'smtp.ionos.com',
        port: Number(settings.smtpPort || 587),
        user: settings.smtpUser,
        pass: settings.smtpPass,
      },
      email: {
        to: data.to,
        subject: data.subject,
        name: data.name,
        message: data.message,
        attachments: data.attachments || [],
      }
    },
  });

  if (error) {
    console.error('Error invoking send-ticket-email function:', error);
    throw new Error(error.message || 'Failed to invoke send-ticket-email function');
  }

  if (responseData?.error) {
    throw new Error(responseData.error);
  }
}
