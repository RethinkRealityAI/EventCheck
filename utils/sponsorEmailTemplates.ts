import { Attendee, AppSettings, SponsorItem, SponsorProspect } from '../types';

/**
 * Render an itemized <ul> HTML list of sponsor items.
 */
export const renderItemsListHtml = (items: SponsorItem[], currency = 'CAD'): string => {
  if (!items.length) return '<p><em>No items selected.</em></p>';
  const rows = items
    .map(i =>
      `<li><strong>${escapeHtml(i.label)}</strong>${i.qty > 1 ? ` &times; ${i.qty}` : ''} — $${i.subtotal.toFixed(2)} ${currency}</li>`)
    .join('');
  return `<ul style="padding-left:20px;line-height:1.8;">${rows}</ul>`;
};

export const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * Replace {{placeholders}} in a template string with values from ctx.
 * Missing placeholders are left as empty strings.
 */
export const mergeTemplate = (template: string, ctx: Record<string, string | undefined>): string =>
  template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => ctx[key] ?? '');

/**
 * Build the context object for a sponsor confirmation/pledge email.
 */
export const buildSponsorEmailContext = (
  attendee: Attendee,
  settings: AppSettings,
  extras: { event: string; eventDate?: string; adminDashboardLink?: string; mailingAddress?: string } = { event: '' }
): Record<string, string> => {
  const items = attendee.sponsorItems || [];
  const total = items.reduce((sum, i) => sum + i.subtotal, 0);
  const currency = settings.currency || 'CAD';
  const company = attendee.companyInfo || { orgName: attendee.name };
  return {
    orgName: company.orgName || attendee.name,
    contactName: company.contactName || attendee.name,
    contactEmail: company.email || attendee.email || '',
    contactPhone: company.phone || '',
    tier: attendee.sponsorTier || '',
    itemsList: renderItemsListHtml(items, currency),
    total: `$${total.toFixed(2)} ${currency}`,
    transactionId: attendee.transactionId || 'Pending',
    event: extras.event || attendee.formTitle || 'Hope Gala & Awards 2026',
    eventDate: extras.eventDate || 'June 13, 2026',
    mailingAddress: (extras.mailingAddress || settings.sponsorChequeMailingAddress || '').replace(/\n/g, '<br>'),
    adminDashboardLink: extras.adminDashboardLink || '',
  };
};

/**
 * Build the context object for a prospect invitation email.
 */
export const buildProspectEmailContext = (
  prospect: SponsorProspect,
  sponsorFormUrl: string,
  event = 'Hope Gala & Awards 2026',
  eventDate = 'June 13, 2026'
): Record<string, string> => ({
  orgName: prospect.orgName,
  contactName: prospect.contactName || 'there',
  contactEmail: prospect.contactEmail,
  event,
  eventDate,
  sponsorFormLink: sponsorFormUrl,
});
