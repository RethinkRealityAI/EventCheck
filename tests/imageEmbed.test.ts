import { describe, it, expect } from 'vitest';
import {
  HEADER_LOGO_CID,
  guessImageContentType,
  isFetchableImageUrl,
  inlineImageSrc,
  inlineAttachmentEntry,
} from '../supabase/functions/_shared/imageEmbed';

describe('guessImageContentType', () => {
  it('maps common extensions', () => {
    expect(guessImageContentType('https://x.co/a.png')).toBe('image/png');
    expect(guessImageContentType('https://x.co/a.jpg')).toBe('image/jpeg');
    expect(guessImageContentType('https://x.co/a.jpeg')).toBe('image/jpeg');
    expect(guessImageContentType('https://x.co/a.gif')).toBe('image/gif');
    expect(guessImageContentType('https://x.co/a.webp')).toBe('image/webp');
    expect(guessImageContentType('https://x.co/a.svg')).toBe('image/svg+xml');
  });

  it('ignores query strings and fragments', () => {
    // Supabase storage URLs routinely carry ?token=... — a naive endsWith
    // check would classify every one of them as PNG by accident.
    expect(guessImageContentType('https://x.co/a.jpg?token=abc&w=100')).toBe('image/jpeg');
    expect(guessImageContentType('https://x.co/a.gif#frag')).toBe('image/gif');
  });

  it('is case-insensitive and defaults to png', () => {
    expect(guessImageContentType('https://x.co/A.JPG')).toBe('image/jpeg');
    expect(guessImageContentType('https://x.co/logo')).toBe('image/png');
    expect(guessImageContentType('')).toBe('image/png');
  });
});

describe('isFetchableImageUrl', () => {
  it('accepts http and https only', () => {
    expect(isFetchableImageUrl('https://x.co/a.png')).toBe(true);
    expect(isFetchableImageUrl('http://x.co/a.png')).toBe(true);
    expect(isFetchableImageUrl('HTTPS://X.CO/a.png')).toBe(true);
  });

  it('rejects data: URIs — Gmail strips them, so they must never be inlined', () => {
    expect(isFetchableImageUrl('data:image/svg+xml;base64,AAAA')).toBe(false);
  });

  it('rejects relative and empty URLs', () => {
    expect(isFetchableImageUrl('/branding/logo.png')).toBe(false);
    expect(isFetchableImageUrl('')).toBe(false);
    expect(isFetchableImageUrl(undefined as any)).toBe(false);
  });
});

describe('inlineImageSrc', () => {
  const url = 'https://proj.supabase.co/storage/v1/object/public/x/logo-1.png?t=1';

  it('rewrites every occurrence to a cid: reference', () => {
    const html = `<img src="${url}"><p>hi</p><img src="${url}">`;
    const out = inlineImageSrc(html, url, HEADER_LOGO_CID);
    expect(out).toBe(`<img src="cid:${HEADER_LOGO_CID}"><p>hi</p><img src="cid:${HEADER_LOGO_CID}">`);
    expect(out).not.toContain('https://');
  });

  it('handles URLs containing regex metacharacters', () => {
    // The URL is used as a literal, not compiled into a RegExp — a `?` or `+`
    // in a signed storage URL would otherwise blow up or silently mismatch.
    const tricky = 'https://x.co/a+b(1).png?q=*&r=^z$';
    const out = inlineImageSrc(`<img src="${tricky}">`, tricky, 'cid1');
    expect(out).toBe('<img src="cid:cid1">');
  });

  it('leaves html untouched when inputs are missing', () => {
    expect(inlineImageSrc('<p>x</p>', '', 'c')).toBe('<p>x</p>');
    expect(inlineImageSrc('<p>x</p>', url, '')).toBe('<p>x</p>');
    expect(inlineImageSrc('', url, 'c')).toBe('');
  });

  it('leaves a non-matching url alone', () => {
    const html = '<img src="https://other.co/z.png">';
    expect(inlineImageSrc(html, url, 'c')).toBe(html);
  });
});

describe('inlineAttachmentEntry', () => {
  it('marks the attachment inline and preserves the cid', () => {
    const entry = inlineAttachmentEntry({
      filename: 'email-header.png',
      content: new Uint8Array([1, 2, 3]),
      cid: HEADER_LOGO_CID,
      contentType: 'image/png',
    });
    expect(entry).toMatchObject({
      filename: 'email-header.png',
      cid: HEADER_LOGO_CID,
      contentType: 'image/png',
      contentDisposition: 'inline',
    });
    expect(entry.content).toBeInstanceOf(Uint8Array);
  });
});
