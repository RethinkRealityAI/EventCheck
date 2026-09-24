// Starting points for the admin "custom ticket email" composer
// (components/Email/CustomTicketEmailModal.tsx). Pure — no client imports — so
// the copy is unit-tested against the server's renderer
// (tests/customTicketPresets.test.ts).

import { snippet, EMAIL_STYLES } from './emailTemplateDoc';

const LINK = EMAIL_STYLES.link;

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
    body: [
      `<p>Dear {{name}},</p>`,
      snippet.condition('is_companion',
        `<p><strong>{{purchaser}}</strong> has registered you for the <strong>GANSID Congress 2026</strong> (October 23–25, Hyderabad, India) through the Thalassemia and Sickle Cell Society (TSCS). Your place is confirmed and there is nothing to pay.</p>`,
        `<p>Thank you for registering for the <strong>GANSID Congress 2026</strong> (October 23–25, Hyderabad, India) through the Thalassemia and Sickle Cell Society (TSCS). Your registration is paid and confirmed.</p>`),
      `<p><strong>Your ticket is attached to this email.</strong> At check-in, show the attached PDF or the QR code below, either on your phone or printed. You do not need an account to attend: the ticket and QR code are all you need.</p>`,
      snippet.callout(`<p><strong>Registration details</strong><br>Name: {{name}}<br>Category: {{ticket_type}}<br>TSCS reference: {{booking_ref}}</p>`),
      snippet.qr(),
      `<p>Can't open the attachment? <a href="{{ticket_download_url}}" style="${LINK}">Download your ticket here</a>.</p>`,
      `<p><strong>Your GANSID Congress app account</strong></p>`,
      snippet.condition('has_account',
        `<p>You already have a GANSID Congress account with <strong>{{email}}</strong>, and this ticket is in it. Sign in any time to see your QR code, the programme and congress updates.</p>`
          + snippet.button('Sign in to my account', '{{portal_url}}'),
        `<p>Creating an account is optional, but we encourage everyone attending to have one. It keeps your ticket and QR code on your phone and brings you the programme and congress updates. Use the button below and your ticket will already be in your new account.</p>`
          + snippet.button('Create my account', '{{account_url}}')),
      snippet.condition('has_companions',
        `<p><strong>Tickets for the people you registered</strong></p>` + snippet.companions()),
      `<p>If you have any questions, contact us at <a href="mailto:congress@inheritedblooddisorders.world" style="${LINK}">congress@inheritedblooddisorders.world</a>.</p>`,
      `<p>We look forward to welcoming you in Hyderabad.</p>`,
    ].join('\n'),
  },
  {
    id: 'blank',
    label: 'Blank (ticket attached automatically)',
    subject: 'Your ticket for {{event}}',
    body: `<p>Hello {{first_name}},</p>
<p></p>`,
  },
];
