import { describe, it, expect } from 'vitest';
import {
  QR_TOKEN,
  DOWNLOAD_TOKEN,
  templateReferencesToken,
  buildQrBlockHtml,
  buildDownloadBlockHtml,
  ensureTicketBlocks,
  prependReissueNotice,
  buildReissueNoticeHtml,
} from '../supabase/functions/_shared/ticketBlock';
import { applyPlaceholders } from '../supabase/functions/_shared/emailShell';

describe('templateReferencesToken', () => {
  it('detects a plain token', () => {
    expect(templateReferencesToken('<img src="{{qr_image_url}}">', QR_TOKEN)).toBe(true);
  });

  it('tolerates surrounding whitespace, matching mergePlaceholders', () => {
    // Detection must not be stricter than substitution, or we would append a
    // SECOND QR block to a template that already renders one.
    expect(templateReferencesToken('{{ qr_image_url }}', QR_TOKEN)).toBe(true);
    expect(templateReferencesToken('{{  qr_image_url  }}', QR_TOKEN)).toBe(true);
  });

  it('does not match a different token or bare text', () => {
    expect(templateReferencesToken('{{qr_image_urlx}}', QR_TOKEN)).toBe(false);
    expect(templateReferencesToken('the qr_image_url goes here', QR_TOKEN)).toBe(false);
    expect(templateReferencesToken('{{ticket_download_url}}', QR_TOKEN)).toBe(false);
  });

  it('handles empty inputs', () => {
    expect(templateReferencesToken('', QR_TOKEN)).toBe(false);
    expect(templateReferencesToken('{{qr_image_url}}', '')).toBe(false);
  });
});

describe('ensureTicketBlocks', () => {
  // This is the exact live GANSID template that shipped the Novartis incident:
  // it promised a QR and an attachment while containing neither.
  const LIVE_GANSID_STAFF_BODY =
    '<p>Hi {{name}},</p><p>Your staff registration for <strong>{{event}}</strong> is confirmed. '
    + 'Your ticket QR is attached and also appears in your portal dashboard.</p>'
    + '<p>Attending with <strong>{{org_name}}</strong>.</p>';

  it('appends a QR block to the real template that caused the incident', () => {
    const out = ensureTicketBlocks(LIVE_GANSID_STAFF_BODY, { includeQr: true });
    expect(templateReferencesToken(out, QR_TOKEN)).toBe(true);
    expect(out.startsWith(LIVE_GANSID_STAFF_BODY)).toBe(true);
  });

  it('appends the download block when asked', () => {
    const out = ensureTicketBlocks(LIVE_GANSID_STAFF_BODY, { includeQr: true, includeDownload: true });
    expect(templateReferencesToken(out, QR_TOKEN)).toBe(true);
    expect(templateReferencesToken(out, DOWNLOAD_TOKEN)).toBe(true);
  });

  it('does NOT duplicate a block the admin already placed', () => {
    const custom = '<p>Top</p><img src="{{qr_image_url}}"><p>Bottom</p>';
    const out = ensureTicketBlocks(custom, { includeQr: true });
    expect(out).toBe(custom);
    expect(out.match(/\{\{qr_image_url\}\}/g)).toHaveLength(1);
  });

  it('respects whitespace-padded tokens when deduping', () => {
    const custom = '<img src="{{ qr_image_url }}">';
    expect(ensureTicketBlocks(custom, { includeQr: true })).toBe(custom);
  });

  it('adds only the missing block when one is already present', () => {
    const custom = '<img src="{{qr_image_url}}">';
    const out = ensureTicketBlocks(custom, { includeQr: true, includeDownload: true });
    expect(out.match(/\{\{qr_image_url\}\}/g)).toHaveLength(1);
    expect(out.match(/\{\{ticket_download_url\}\}/g)).toHaveLength(1);
  });

  it('is a no-op when nothing is requested', () => {
    expect(ensureTicketBlocks(LIVE_GANSID_STAFF_BODY)).toBe(LIVE_GANSID_STAFF_BODY);
    expect(ensureTicketBlocks(LIVE_GANSID_STAFF_BODY, { includeQr: false, includeDownload: false }))
      .toBe(LIVE_GANSID_STAFF_BODY);
  });

  it('handles null/undefined templates without throwing', () => {
    expect(ensureTicketBlocks(undefined as any, { includeQr: true })).toContain('{{qr_image_url}}');
    expect(ensureTicketBlocks(null as any)).toBe('');
  });
});

describe('ticket blocks resolve to a real image and link', () => {
  it('renders a scannable <img> and a live href after placeholder substitution', () => {
    const template = ensureTicketBlocks('<p>Hi {{name}},</p>', { includeQr: true, includeDownload: true });
    const html = applyPlaceholders(template, {
      name: 'Sameera G',
      qr_image_url: 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=%7B%22id%22%3A%22abc%22%7D',
      ticket_download_url: 'https://gansid.netlify.app/#/tickets?token=sig',
    }, 'staff-claim-completed');

    expect(html).toContain('src="https://api.qrserver.com/');
    expect(html).toContain('href="https://gansid.netlify.app/#/tickets?token=sig"');
    // The scrub must not have emptied anything — that is the failure mode
    // where "the email arrived with no link".
    expect(html).not.toContain('{{');
    expect(html).not.toContain('src=""');
    expect(html).not.toContain('href=""');
  });

  it('mentions the PNG attachment so a reader with images off knows to look', () => {
    expect(buildQrBlockHtml()).toContain('GANSID-Congress-check-in-QR.png');
  });

  it('download block is a real anchor', () => {
    expect(buildDownloadBlockHtml()).toContain('<a href="{{ticket_download_url}}"');
  });
});

describe('prependReissueNotice', () => {
  it('passes the body through untouched when not re-issuing', () => {
    expect(prependReissueNotice('<p>Body</p>', false)).toBe('<p>Body</p>');
    expect(prependReissueNotice('<p>Body</p>', undefined)).toBe('<p>Body</p>');
  });

  it('prepends the notice ABOVE the body when re-issuing', () => {
    const out = prependReissueNotice('<p>Body</p>', true);
    expect(out.endsWith('<p>Body</p>')).toBe(true);
    expect(out.indexOf('resending your ticket')).toBeLessThan(out.indexOf('<p>Body</p>'));
  });

  it('reassures that the registration itself was never affected', () => {
    // A recipient told "your QR is attached" who saw an empty box has good
    // reason to fear their booking is gone. The copy must address that.
    expect(buildReissueNoticeHtml()).toContain('never affected');
    expect(buildReissueNoticeHtml().toLowerCase()).toContain('sorry');
  });

  it('handles a null body', () => {
    expect(prependReissueNotice(null as any, false)).toBe('');
    expect(prependReissueNotice(null as any, true)).toContain('resending your ticket');
  });
});
