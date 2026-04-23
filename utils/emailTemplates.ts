import { Attendee, AppSettings } from '../types';
import { CURRENT_SITE } from '../config/sites';
import { renderEmailShell, mergePlaceholders } from './emailShell';

/**
 * Merge an admin-edited ticket-email template with an attendee's data and
 * wrap it in the site-aware branded shell. Used by the client-side ticket
 * email flow (SCAGO + GANSID).
 */
export const generateEmailHtml = (settings: AppSettings, template: string, attendee: Attendee | null): string => {
  const name = attendee?.name || 'Valued Guest';
  const formTitle = attendee?.formTitle || settings.pdfSettings.eventTitle || 'Event';
  const id = attendee?.id || 'NO-ID';
  const invoiceId = attendee?.invoiceId || 'N/A';
  const amount = settings.ticketPrice.toString();

  let body = mergePlaceholders(template, {
    name,
    event: formTitle,
    id,
    invoiceId,
    amount,
    link: '#register-link',
  });

  if (attendee?.donatedSeats && attendee.donatedSeats > 0) {
    const isTableDonation = attendee.donationType === 'table' && (attendee.donatedTables || 0) > 0;
    const donationLabel = isTableDonation
      ? `<strong>${attendee.donatedTables} table${(attendee.donatedTables || 0) !== 1 ? 's' : ''}</strong> (${attendee.donatedSeats} seat${attendee.donatedSeats !== 1 ? 's' : ''})`
      : `<strong>${attendee.donatedSeats} seat${attendee.donatedSeats !== 1 ? 's' : ''}</strong>`;
    body += `
      <div style="margin-top: 24px; padding-top: 24px; border-top: 1px dashed #e5e7eb;">
        <h3 style="margin: 0 0 8px; font-size: 16px; color: #111827;">\ud83e\ude91 ${isTableDonation ? 'Table' : 'Seat'} Donation</h3>
        <p style="margin: 0; color: #4b5563;">Thank you for generously donating ${donationLabel} for others to attend.</p>
      </div>
    `;
  }

  return renderEmailShell({
    content: body,
    site: CURRENT_SITE.key,
    headerImageUrl: settings.emailHeaderLogo || undefined,
    footerText: settings.emailFooterText,
  });
};
