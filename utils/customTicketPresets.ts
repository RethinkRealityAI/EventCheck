// Starting points for the admin "custom ticket email" composer
// (components/Email/CustomTicketEmailModal.tsx). Pure — no client imports — so
// the copy is unit-tested against the server's renderer
// (tests/customTicketPresets.test.ts).

const BUTTON = 'display:inline-block;padding:12px 24px;background:#1E4A8C;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;';
const LINK = 'color:#1E4A8C;font-weight:600;';

export interface CustomTicketPreset {
  id: string;
  label: string;
  subject: string;
  body: string;
}

/**
 * Presets for the composer. Each branches on the three server flags
 * (has_account, is_companion, has_companions), so one preset serves a whole
 * batch of bookers and companions.
 */
export const CUSTOM_TICKET_PRESETS: CustomTicketPreset[] = [
  {
    id: 'tscs-india',
    label: 'TSCS India registration',
    subject: 'Your GANSID Congress 2026 ticket — {{name}}',
    body: `<p>Hello {{first_name}},</p>
{{#if is_companion}}<p><strong>{{purchaser}}</strong> has registered you for the <strong>GANSID Congress 2026</strong> (October 23–25, Hyderabad, India) through the Thalassemia and Sickle Cell Society (TSCS). Your place is confirmed and there is nothing to pay.</p>{{else}}<p>Thank you for registering for the <strong>GANSID Congress 2026</strong> (October 23–25, Hyderabad, India) through the Thalassemia and Sickle Cell Society (TSCS). Your registration is paid and confirmed.</p>{{/if}}
<p><strong>Your ticket is attached to this email.</strong> At check-in, show the attached PDF or the QR code below, either on your phone or printed. You do not need an account to attend: the ticket and QR code are all you need.</p>
<p style="background:#f3f6fb;border-radius:8px;padding:12px 16px;margin:16px 0;"><strong>Registration details</strong><br>Name: {{name}}<br>Category: {{ticket_type}}<br>TSCS reference: {{booking_ref}}</p>
<div style="text-align:center;margin:16px 0;"><img src="{{qr_image_url}}" alt="Check-in QR code" width="200" height="200" style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;" /></div>
<p style="font-size:13px;color:#6b7280;">Can't open the attachment? <a href="{{ticket_download_url}}" style="${LINK}">Download your ticket here</a>.</p>
<p style="margin-top:24px;"><strong>Your GANSID Congress app account</strong></p>
{{#if has_account}}<p>You already have a GANSID Congress account with <strong>{{email}}</strong>, and this ticket is in it. Sign in any time to see your QR code, the programme and congress updates.</p>
<p style="text-align:center;margin:20px 0;"><a href="{{portal_url}}" style="${BUTTON}">Sign in to my account</a></p>{{else}}<p>Creating an account is optional, but we encourage everyone attending to have one. It keeps your ticket and QR code on your phone and brings you the programme and congress updates. Use the button below and your ticket will already be in your new account.</p>
<p style="text-align:center;margin:20px 0;"><a href="{{account_url}}" style="${BUTTON}">Create my account</a></p>{{/if}}
{{#if has_companions}}<p style="margin-top:24px;"><strong>Tickets for the people you registered</strong></p>
{{companions}}{{/if}}
<p>If you have any questions, contact us at <a href="mailto:congress@inheritedblooddisorders.world" style="${LINK}">congress@inheritedblooddisorders.world</a>.</p>
<p>We look forward to welcoming you in Hyderabad.</p>`,
  },
  {
    id: 'blank',
    label: 'Blank (ticket attached automatically)',
    subject: 'Your ticket for {{event}}',
    body: `<p>Hello {{first_name}},</p>
<p></p>`,
  },
];

/** Placeholders and flags, for the composer's help panel. */
export const CUSTOM_TICKET_HELP = {
  placeholders: [
    ['{{name}} / {{first_name}}', 'Recipient'],
    ['{{email}}', 'Their address'],
    ['{{ticket_type}}', 'Category on the ticket'],
    ['{{booking_ref}}', 'TSCS ref, else transaction id'],
    ['{{purchaser}}', 'Who booked them (companions)'],
    ['{{account_url}}', 'Create-account link, already tied to their ticket'],
    ['{{portal_url}}', 'Sign-in page'],
    ['{{qr_image_url}}', 'Check-in QR (added automatically if you leave it out)'],
    ['{{ticket_download_url}}', 'Ticket download link (added automatically if left out)'],
    ['{{companions}}', 'List of the people they booked for, with account links'],
  ] as const,
  flags: [
    ['has_account', 'They already have a portal account'],
    ['is_companion', 'A free add-on someone else booked'],
    ['has_companions', 'They booked for other people'],
  ] as const,
};
