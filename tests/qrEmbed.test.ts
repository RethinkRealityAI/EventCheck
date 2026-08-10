import { describe, it, expect } from 'vitest';
import { QR_CID, buildQrImageUrl, inlineQrSrc } from '../supabase/functions/_shared/qrEmbed';

describe('buildQrImageUrl', () => {
  it('encodes the QR payload so JSON braces/quotes survive the query string', () => {
    const payload = '{"id":"d794f7d7-3214-4729-88c8-dd899ec82d5d"}';
    const url = buildQrImageUrl(payload);
    expect(url).toContain(`data=${encodeURIComponent(payload)}`);
    // The raw braces must NOT appear unencoded — that breaks the generator.
    expect(url).not.toContain('{"id"');
  });

  it('honours a custom size', () => {
    expect(buildQrImageUrl('x', 480)).toContain('size=480x480');
  });
});

describe('inlineQrSrc', () => {
  const payload = '{"id":"abc"}';
  const url = buildQrImageUrl(payload);

  it('repoints the QR <img> at the inline attachment', () => {
    const html = `<div><img src="${url}" alt="Check-in QR code" width="240" /></div>`;
    expect(inlineQrSrc(html, url)).toBe(`<div><img src="cid:${QR_CID}" alt="Check-in QR code" width="240" /></div>`);
  });

  it('rewrites EVERY occurrence — a custom template may show the QR twice', () => {
    const html = `<img src="${url}"><p>x</p><img src="${url}">`;
    const out = inlineQrSrc(html, url);
    expect(out.split(`cid:${QR_CID}`).length - 1).toBe(2);
    expect(out).not.toContain('api.qrserver.com');
  });

  it('leaves other images (header logo) untouched', () => {
    const html = `<img src="https://cdn.example.com/logo.png"><img src="${url}">`;
    const out = inlineQrSrc(html, url);
    expect(out).toContain('https://cdn.example.com/logo.png');
    expect(out).toContain(`cid:${QR_CID}`);
  });

  it('is a no-op when the URL is absent from the HTML (admin rewrote the template)', () => {
    const html = '<p>no qr here</p>';
    expect(inlineQrSrc(html, url)).toBe(html);
  });

  it('does not treat regex metacharacters in the URL as a pattern', () => {
    // The URL is full of ? . + ( ) — a naive RegExp would mis-match or throw.
    const tricky = buildQrImageUrl('a+b (c) [d] ?e.f');
    const html = `<img src="${tricky}">`;
    expect(inlineQrSrc(html, tricky)).toBe(`<img src="cid:${QR_CID}">`);
  });

  it('handles empty inputs safely', () => {
    expect(inlineQrSrc('', url)).toBe('');
    expect(inlineQrSrc('<p>x</p>', '')).toBe('<p>x</p>');
  });
});
