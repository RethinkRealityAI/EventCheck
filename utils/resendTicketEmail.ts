import { Attendee, Form } from '../types';
import { getAttendee, getSettings, getStaffForPrimary, updateAttendee } from '../services/storageService';
import { sendTicketEmail, arrayBufferToBase64 } from '../services/smtpService';
import { applyPlaceholders } from './emailShell';
import { resolveEmailTemplate } from './emailTemplates';
import { generateTicketPDF } from './pdfGenerator';
import { isPlaceholderGuestName, resolveAttendeeDisplayName } from './resolveAttendeeDisplayName';
import { isTableGuestRow } from './tableSeats';

function guestSortKey(a: Attendee): number {
  const m = (a.name || '').match(/#(\d+)\s*$/);
  if (m) return parseInt(m[1], 10);
  return a.registeredAt ? new Date(a.registeredAt).getTime() / 1000 : Number.MAX_SAFE_INTEGER;
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9 ]/g, '_') || 'Ticket';
}

function isPendingClaimGuest(a: Attendee): boolean {
  return a.guestType === 'pending-claim'
    || a.guestType === 'exhibitor-staff-pending'
    || a.guestType === 'staff-pending';
}

export interface ResendTicketResult {
  recipientEmail: string;
  guestCount: number;
  isTablePurchaser: boolean;
}

/**
 * Re-send ticket email(s) using fresh DB rows so admin edits to guest names
 * are reflected in regenerated PDFs. Table purchasers receive their own ticket
 * plus every linked guest PDF and pending-claim links when applicable.
 */
export async function resendTicketEmailForAttendee(
  attendeeId: string,
  forms: Form[],
  origin: string,
  scope: 'primary-only' | 'all' = 'all',
): Promise<ResendTicketResult> {
  const fresh = await getAttendee(attendeeId);
  if (!fresh) {
    throw new Error('Attendee record not found.');
  }

  const settings = await getSettings();
  // Env-first SMTP (Resend on GANSID) means the client cannot see the real
  // credentials; smtp_pass is intentionally cleared on GANSID. Only block when
  // NOTHING is configured on either side (smtp_user present keeps the gate green).
  if (!settings.smtpUser && !settings.smtpPass) {
    throw new Error('SMTP is not configured. Set it up in Settings before resending tickets.');
  }

  const form = forms.find(f => f.id === fresh.formId);
  const primaryDisplayName = resolveAttendeeDisplayName(fresh, form);

  const guests = (fresh.isPrimary !== false && scope === 'all')
    ? (await getStaffForPrimary(fresh.id))
        .filter(isTableGuestRow)
        .slice()
        .sort((a, b) => guestSortKey(a) - guestSortKey(b))
    : [];

  const attachments: Array<{ filename: string; content: string; contentType: string }> = [];

  const primaryDoc = await generateTicketPDF(fresh, settings, form);
  attachments.push({
    filename: `${safeFilename(primaryDisplayName)}_Ticket.pdf`,
    content: arrayBufferToBase64(primaryDoc.output('arraybuffer')),
    contentType: 'application/pdf',
  });

  const claimLinks: Array<{ name: string; url: string }> = [];
  for (let i = 0; i < guests.length; i++) {
    const g = guests[i];
    const guestDisplayName = resolveAttendeeDisplayName(g, form);
    const pending = isPendingClaimGuest(g);
    const registrationUrl = pending ? `${origin}/#/form/${g.formId}?ref=${g.id}` : undefined;
    const guestDoc = await generateTicketPDF(g, settings, form, registrationUrl);
    attachments.push({
      filename: `${isPlaceholderGuestName(guestDisplayName) ? `Guest_${i + 2}` : safeFilename(guestDisplayName)}_Ticket.pdf`,
      content: arrayBufferToBase64(guestDoc.output('arraybuffer')),
      contentType: 'application/pdf',
    });
    if (registrationUrl) claimLinks.push({ name: guestDisplayName, url: registrationUrl });
  }

  const claimLinksBlock = claimLinks.length > 0
    ? `<div style="margin-top:16px;padding:12px 16px;background:#f8fafc;border-left:3px solid #4f46e5;border-radius:4px;">
         <p style="margin:0 0 8px;font-weight:600;">Registration links for your guests</p>
         <p style="margin:0 0 10px;font-size:13px;color:#475569;">Forward a link below to each guest so they can complete their own details. Each link claims one seat.</p>
         <ol style="margin:0;padding-left:20px;line-height:1.8;font-size:13px;">
           ${claimLinks.map(g => `<li><strong>${g.name}</strong> — <a href="${g.url}">Claim / register</a><br><span style="color:#64748b;font-size:12px;">${g.url}</span></li>`).join('')}
         </ol>
       </div>`
    : '';

  const isTable = guests.length > 0;
  // Resolve subject/body through the canonical resolver so a per-form override
  // (form.settings.emailOverrides, gated on enabled) wins consistently — the
  // same precedence the edge P4 confirmation applies. Preserves the historical
  // table→standard `||` fallback and the inline defaults for the global tier.
  // NOTE: sendTicketEmail wraps via the edge shell (global branding), so the
  // per-form header image does NOT flow through this attachment path; we only
  // apply the subject/body override here (header image is a nice-to-have on
  // this path, deliberately not re-architected).
  const overrides = form?.settings?.emailOverrides;
  const ovEnabled = overrides?.enabled === true;
  const tplKey = isTable ? 'table-purchaser' : 'ticket';
  const resolved = resolveEmailTemplate({
    formOverride: ovEnabled ? overrides?.templates?.[tplKey] : undefined,
    globalSubject: isTable ? (settings.emailTablePurchaserSubject || settings.emailSubject) : settings.emailSubject,
    globalBody: isTable ? (settings.emailTablePurchaserBody || settings.emailBodyTemplate) : settings.emailBodyTemplate,
    defaultSubject: 'Your ticket for {{event}}',
    defaultBody: '<p>Thank you for registering for <strong>{{event}}</strong>.</p>',
    formHeaderImageUrl: ovEnabled ? overrides?.headerImageUrl : undefined,
    globalHeaderImageUrl: settings.emailHeaderLogo,
    globalFooterText: settings.emailFooterText,
  });
  const subjectTpl = resolved.subject;
  const bodyTpl = resolved.body;

  const render = (s: string) => applyPlaceholders(s, {
    event: fresh.formTitle || form?.title || '',
    name: primaryDisplayName,
    id: fresh.id || '',
    invoiceId: fresh.invoiceId || '',
    amount: fresh.paymentAmount || '',
  });

  await sendTicketEmail(settings, {
    to: fresh.email,
    subject: render(subjectTpl),
    name: primaryDisplayName,
    title: fresh.formTitle || form?.title || undefined,
    message: render(bodyTpl) + claimLinksBlock,
    attachments,
  });

  const ts = new Date().toISOString();
  try {
    await updateAttendee(fresh.id, { lastTicketEmailAt: ts });
    if (guests.length > 0) {
      await Promise.all(guests.map(g => updateAttendee(g.id, { lastTicketEmailAt: ts })));
    }
  } catch (err) {
    console.warn('Failed to stamp lastTicketEmailAt after resend', err);
  }

  return {
    recipientEmail: fresh.email,
    guestCount: guests.length,
    isTablePurchaser: isTable,
  };
}
