import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  mergeTemplate,
  renderItemsListHtml,
  buildSponsorEmailContext,
  buildProspectEmailContext,
} from '../utils/sponsorEmailTemplates';
import { DEFAULT_SETTINGS, Attendee, SponsorProspect, SponsorItem } from '../types';

describe('escapeHtml', () => {
  it('escapes the five HTML special chars', () => {
    expect(escapeHtml(`<script>alert("x&y's")</script>`))
      .toBe(`&lt;script&gt;alert(&quot;x&amp;y&#39;s&quot;)&lt;/script&gt;`);
  });
  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('');
  });
  it('leaves safe text alone', () => {
    expect(escapeHtml('Hello world 123')).toBe('Hello world 123');
  });
});

describe('mergeTemplate', () => {
  it('replaces single placeholder', () => {
    expect(mergeTemplate('Hi {{name}}', { name: 'Alex' })).toBe('Hi Alex');
  });
  it('replaces multiple placeholders', () => {
    expect(mergeTemplate('{{a}}+{{b}}={{c}}', { a: '1', b: '2', c: '3' })).toBe('1+2=3');
  });
  it('ignores missing placeholders (renders empty)', () => {
    expect(mergeTemplate('Hi {{name}}, event: {{event}}', { name: 'Alex' })).toBe('Hi Alex, event: ');
  });
  it('tolerates whitespace inside placeholders', () => {
    expect(mergeTemplate('{{  name  }}', { name: 'Alex' })).toBe('Alex');
  });
  it('leaves non-placeholder braces alone', () => {
    expect(mergeTemplate('{ single } {{ok}} { no }', { ok: 'yes' })).toBe('{ single } yes { no }');
  });
});

describe('renderItemsListHtml', () => {
  it('renders empty-state message when no items', () => {
    const out = renderItemsListHtml([]);
    expect(out).toContain('No items selected');
  });
  it('renders each item as a <li>', () => {
    const items: SponsorItem[] = [
      { type: 'package', key: 'tier-gold', label: 'Gold', qty: 1, unitPrice: 35000, subtotal: 35000 },
      { type: 'scholarship', key: 'item-scholarship', label: 'Scholarship', qty: 2, unitPrice: 2500, subtotal: 5000 },
    ];
    const out = renderItemsListHtml(items, 'CAD');
    expect(out).toContain('<li>');
    expect(out).toContain('Gold');
    expect(out).toContain('Scholarship');
    expect(out).toContain('&times; 2');
    expect(out).toContain('$35000.00 CAD');
    expect(out).toContain('$5000.00 CAD');
  });
  it('escapes item labels to prevent HTML injection', () => {
    const items: SponsorItem[] = [
      { type: 'package', key: 'x', label: '<img onerror=alert(1)>', qty: 1, unitPrice: 100, subtotal: 100 },
    ];
    const out = renderItemsListHtml(items);
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
  });
});

describe('buildSponsorEmailContext', () => {
  const baseAttendee: Attendee = {
    id: 'att-1',
    formId: 'f-1',
    // Set formTitle to the expected event name so no-extras path resolves correctly
    formTitle: 'Hope Gala & Awards 2026',
    name: 'Org',
    email: 'org@example.com',
    ticketType: 'Gold x1',
    registeredAt: new Date().toISOString(),
    qrPayload: '{}',
    isPrimary: true,
    sponsorTier: 'gold',
    sponsorItems: [
      { type: 'package', key: 'tier-gold', label: 'Gold', qty: 1, unitPrice: 35000, subtotal: 35000 },
    ],
    paymentMethod: 'paypal',
    companyInfo: { orgName: 'Acme Inc', contactName: 'Alex', email: 'alex@acme.com', phone: '555-0100' },
    sponsoredAwards: ['Nursing'],
    transactionId: 'TXN-1',
    paymentAmount: '35000.00 CAD',
    invoiceId: 'INV-1',
  };

  it('populates all placeholder keys', () => {
    const ctx = buildSponsorEmailContext(baseAttendee, DEFAULT_SETTINGS);
    expect(ctx.orgName).toBe('Acme Inc');
    expect(ctx.contactName).toBe('Alex');
    expect(ctx.contactEmail).toBe('alex@acme.com');
    expect(ctx.contactPhone).toBe('555-0100');
    expect(ctx.tier).toBe('gold');
    expect(ctx.total).toContain('35000.00');
    expect(ctx.total).toContain('CAD');
    expect(ctx.transactionId).toBe('TXN-1');
    expect(ctx.event).toBe('Hope Gala & Awards 2026');
    expect(ctx.eventDate).toBe('June 13, 2026');
    expect(ctx.itemsList).toContain('<li>');
    expect(ctx.itemsList).toContain('Gold');
  });

  it('falls back to attendee.name when companyInfo.orgName missing', () => {
    const { companyInfo, ...rest } = baseAttendee;
    const ctx = buildSponsorEmailContext(rest as Attendee, DEFAULT_SETTINGS);
    expect(ctx.orgName).toBe('Org');
  });

  it('renders "Pending" when no transactionId', () => {
    const { transactionId, ...rest } = baseAttendee;
    const ctx = buildSponsorEmailContext(rest as Attendee, DEFAULT_SETTINGS);
    expect(ctx.transactionId).toBe('Pending');
  });

  it('replaces newlines in mailingAddress with <br>', () => {
    const settings = { ...DEFAULT_SETTINGS, sponsorChequeMailingAddress: 'Line 1\nLine 2\nLine 3' };
    const ctx = buildSponsorEmailContext(baseAttendee, settings);
    expect(ctx.mailingAddress).toBe('Line 1<br>Line 2<br>Line 3');
  });

  it('uses extras event/eventDate override when provided', () => {
    const ctx = buildSponsorEmailContext(baseAttendee, DEFAULT_SETTINGS, { event: 'Future Gala', eventDate: 'January 1, 2030' });
    expect(ctx.event).toBe('Future Gala');
    expect(ctx.eventDate).toBe('January 1, 2030');
  });
});

describe('buildProspectEmailContext', () => {
  it('maps prospect fields and sets form link', () => {
    const p: SponsorProspect = {
      id: 'p-1',
      orgName: 'Acme',
      contactName: 'Alex',
      contactEmail: 'alex@acme.com',
      status: 'prospect',
      emailHistory: [],
      createdAt: new Date().toISOString(),
    };
    const ctx = buildProspectEmailContext(p, 'https://example.com/form/abc');
    expect(ctx.orgName).toBe('Acme');
    expect(ctx.contactName).toBe('Alex');
    expect(ctx.contactEmail).toBe('alex@acme.com');
    expect(ctx.sponsorFormLink).toBe('https://example.com/form/abc');
    expect(ctx.event).toBe('Hope Gala & Awards 2026');
    expect(ctx.eventDate).toBe('June 13, 2026');
  });

  it('falls back contactName to "there" when missing', () => {
    const p: SponsorProspect = {
      id: 'p-2',
      orgName: 'Acme',
      contactEmail: 'x@acme.com',
      status: 'prospect',
      emailHistory: [],
      createdAt: new Date().toISOString(),
    };
    const ctx = buildProspectEmailContext(p, 'url');
    expect(ctx.contactName).toBe('there');
  });

  it('accepts custom event and eventDate', () => {
    const p: SponsorProspect = {
      id: 'p-3', orgName: 'X', contactEmail: 'x@x.com', status: 'prospect', emailHistory: [], createdAt: '2026-01-01T00:00:00Z',
    };
    const ctx = buildProspectEmailContext(p, 'url', 'Custom Event', 'December 31, 2030');
    expect(ctx.event).toBe('Custom Event');
    expect(ctx.eventDate).toBe('December 31, 2030');
  });
});
