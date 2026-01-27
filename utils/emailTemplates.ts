import { Attendee, AppSettings } from '../types';

export const generateEmailHtml = (settings: AppSettings, template: string, attendee: Attendee | null): string => {
  // Default placeholders if no attendee
  const name = attendee?.name || 'Valued Guest';
  const formTitle = attendee?.formTitle || settings.pdfSettings.eventTitle || 'Event';
  const id = attendee?.id || 'NO-ID';
  const invoiceId = attendee?.invoiceId || 'N/A';
  const amount = settings.ticketPrice.toString();

  const body = template
    .replace(/{{name}}/g, name)
    .replace(/{{event}}/g, formTitle)
    .replace(/{{id}}/g, id)
    .replace(/{{invoiceId}}/g, invoiceId)
    .replace(/{{amount}}/g, amount)
    .replace(/{{link}}/g, '#register-link'); // TODO: Add real registration/management link if available

  const headerColor = settings.emailHeaderColor || '#f8fafc';
  const footerColor = settings.emailFooterColor || '#f8fafc';

  // Wrap in standard HTML structure with header/footer
  return `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
        ${settings.emailHeaderLogo ? `<div style="background: ${headerColor}; padding: 24px; text-align: center; border-bottom: 1px solid #e5e7eb;"><img src="${settings.emailHeaderLogo}" style="max-height: 60px; max-width: 200px;" alt="Logo"/></div>` : `<div style="background: ${headerColor}; padding: 16px; border-bottom: 1px solid #e5e7eb;"></div>`}
        <div style="padding: 32px;">
          ${body}
        </div>
        <div style="background: ${footerColor}; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb;">
          ${settings.emailFooterText}
        </div>
      </div>
    `;
};
