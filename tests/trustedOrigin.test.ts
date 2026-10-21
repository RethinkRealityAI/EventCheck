import { describe, it, expect } from 'vitest';
import {
  APP_SITE_ORIGINS,
  isTrustedOrigin,
  parseOriginList,
  resolveTrustedOrigin,
  trustedLinkUrl,
} from '../supabase/functions/_shared/emailLinks';

const PUBLIC = 'https://gansid.netlify.app';
const cfg = { publicSiteUrl: PUBLIC };
const TRACK = 'https://ref.supabase.co/functions/v1/track-email';

describe('isTrustedOrigin', () => {
  it('trusts the production sites', () => {
    for (const o of APP_SITE_ORIGINS) expect(isTrustedOrigin(o)).toBe(true);
    expect(isTrustedOrigin('https://qreventcheck.netlify.app/#/portal')).toBe(true);
  });

  it('trusts loopback dev servers on any port', () => {
    expect(isTrustedOrigin('http://localhost:5173')).toBe(true);
    expect(isTrustedOrigin('http://127.0.0.1:3000')).toBe(true);
    expect(isTrustedOrigin('http://[::1]:8080')).toBe(true);
  });

  it('trusts the extras passed in', () => {
    expect(isTrustedOrigin('https://congress.example.org', ['https://congress.example.org/'])).toBe(true);
  });

  it('refuses everything else', () => {
    expect(isTrustedOrigin('https://evil.example')).toBe(false);
    expect(isTrustedOrigin('https://gansid.netlify.app.evil.example')).toBe(false);
    expect(isTrustedOrigin('https://evil--gansid.netlify.app')).toBe(false);
    expect(isTrustedOrigin('http://gansid.netlify.app')).toBe(false); // scheme matters
    expect(isTrustedOrigin('https://localhost.evil.example')).toBe(false);
    expect(isTrustedOrigin('')).toBe(false);
    expect(isTrustedOrigin(undefined)).toBe(false);
    expect(isTrustedOrigin('/relative')).toBe(false);
  });
});

describe('parseOriginList', () => {
  it('splits on commas and whitespace and normalizes', () => {
    expect(parseOriginList('https://a.org/, https://b.org/x  junk')).toEqual(['https://a.org', 'https://b.org']);
    expect(parseOriginList(undefined)).toEqual([]);
  });
});

describe('resolveTrustedOrigin', () => {
  it('uses a trusted caller origin', () => {
    expect(resolveTrustedOrigin(['http://localhost:5173'], cfg)).toBe('http://localhost:5173');
    expect(resolveTrustedOrigin(['https://qreventcheck.netlify.app'], cfg)).toBe('https://qreventcheck.netlify.app');
  });

  it('falls back to PUBLIC_SITE_URL when the caller origin is not ours', () => {
    expect(resolveTrustedOrigin(['https://evil.example', 'https://also-evil.example'], cfg)).toBe(PUBLIC);
  });

  it('skips an untrusted first candidate for a trusted second', () => {
    expect(resolveTrustedOrigin(['https://evil.example', 'https://qreventcheck.netlify.app'], cfg))
      .toBe('https://qreventcheck.netlify.app');
  });

  it('treats PUBLIC_SITE_URL and ALLOWED_LINK_ORIGINS as trusted caller origins', () => {
    const custom = { publicSiteUrl: 'https://tickets.example.org/', allowedOrigins: 'https://preview.example.org' };
    expect(resolveTrustedOrigin(['https://tickets.example.org'], custom)).toBe('https://tickets.example.org');
    expect(resolveTrustedOrigin(['https://preview.example.org'], custom)).toBe('https://preview.example.org');
  });

  it('returns empty when nothing trusted resolves — never the caller\'s value', () => {
    expect(resolveTrustedOrigin(['https://evil.example'], {})).toBe('');
    expect(resolveTrustedOrigin([], {})).toBe('');
  });
});

describe('trustedLinkUrl', () => {
  it('keeps a link already on a trusted origin', () => {
    expect(trustedLinkUrl('https://gansid.netlify.app/#/tickets?token=a.b', cfg))
      .toBe('https://gansid.netlify.app/#/tickets?token=a.b');
  });

  it('re-bases a link on a foreign host onto PUBLIC_SITE_URL, keeping path, query and hash', () => {
    expect(trustedLinkUrl('https://evil.example/x?y=1#/tickets?token=a.b', cfg))
      .toBe('https://gansid.netlify.app/x?y=1#/tickets?token=a.b');
  });

  it('drops a foreign link when there is no trusted fallback', () => {
    expect(trustedLinkUrl('https://evil.example/#/tickets?token=a.b', {})).toBe('');
  });

  it('drops relative and malformed input', () => {
    expect(trustedLinkUrl('/#/tickets?token=a.b', cfg)).toBe('');
    expect(trustedLinkUrl('javascript:alert(1)', cfg)).toBe('');
    expect(trustedLinkUrl(undefined, cfg)).toBe('');
  });

  it('accepts our own click-tracking wrapper when the link inside it is trusted', () => {
    const inner = 'https://gansid.netlify.app/#/tickets?token=a.b';
    const wrapped = `${TRACK}?id=t1&type=click&to=${encodeURIComponent(inner)}`;
    const out = trustedLinkUrl(wrapped, { ...cfg, trackingEndpoint: TRACK });
    expect(out.startsWith(`${TRACK}?`)).toBe(true);
    const params = new URL(out).searchParams;
    expect(params.get('id')).toBe('t1');
    expect(params.get('to')).toBe(inner);
  });

  it('re-bases the link inside a tracking wrapper', () => {
    const wrapped = `${TRACK}?id=t1&type=click&to=${encodeURIComponent('https://evil.example/#/tickets?token=a.b')}`;
    const out = trustedLinkUrl(wrapped, { ...cfg, trackingEndpoint: TRACK });
    expect(new URL(out).searchParams.get('to')).toBe('https://gansid.netlify.app/#/tickets?token=a.b');
  });

  it('does not treat a look-alike tracking host as ours', () => {
    const wrapped = `https://evil.example/functions/v1/track-email?id=t1&type=click&to=x`;
    expect(trustedLinkUrl(wrapped, { ...cfg, trackingEndpoint: TRACK }))
      .toBe('https://gansid.netlify.app/functions/v1/track-email?id=t1&type=click&to=x');
  });
});
