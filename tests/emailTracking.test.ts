import { describe, it, expect } from 'vitest';
import {
  trackingEndpoint,
  buildOpenPixelUrl,
  wrapClickUrl,
  appendTrackingPixel,
} from '../supabase/functions/_shared/emailTracking';

const URL_ = 'https://gticuvgclbvhwvpzkuez.supabase.co';
const TID = 'abc123';

describe('trackingEndpoint', () => {
  it('builds the track-email endpoint and tolerates a trailing slash', () => {
    expect(trackingEndpoint(URL_)).toBe(`${URL_}/functions/v1/track-email`);
    expect(trackingEndpoint(`${URL_}/`)).toBe(`${URL_}/functions/v1/track-email`);
  });

  it('returns empty string when the project URL is missing', () => {
    expect(trackingEndpoint('')).toBe('');
  });
});

describe('buildOpenPixelUrl', () => {
  it('encodes the tracking id and marks type=open', () => {
    expect(buildOpenPixelUrl(URL_, TID)).toBe(`${URL_}/functions/v1/track-email?id=abc123&type=open`);
  });

  it('returns empty string without a url or tracking id (caller then skips the pixel)', () => {
    expect(buildOpenPixelUrl('', TID)).toBe('');
    expect(buildOpenPixelUrl(URL_, '')).toBe('');
  });
});

describe('wrapClickUrl', () => {
  it('wraps the destination and url-encodes it', () => {
    const dest = 'https://gansid.netlify.app/#/tickets?token=a+b&x=1';
    const wrapped = wrapClickUrl(URL_, TID, dest);
    expect(wrapped).toContain('type=click');
    expect(wrapped).toContain(`to=${encodeURIComponent(dest)}`);
  });

  it('falls back to the raw destination when tracking is unavailable', () => {
    const dest = 'https://example.com/x';
    expect(wrapClickUrl('', TID, dest)).toBe(dest);
    expect(wrapClickUrl(URL_, '', dest)).toBe(dest);
    expect(wrapClickUrl(URL_, TID, '')).toBe('');
  });
});

describe('appendTrackingPixel', () => {
  const pixel = 'https://x.co/track?id=1';

  it('inserts the pixel before </body> when present', () => {
    const out = appendTrackingPixel('<html><body><p>hi</p></body></html>', pixel);
    expect(out).toBe(`<html><body><p>hi</p><img src="${pixel}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden;" /></body></html>`);
  });

  it('handles an uppercase </BODY>', () => {
    const out = appendTrackingPixel('<BODY>hi</BODY>', pixel);
    expect(out.indexOf('<img')).toBeLessThan(out.toLowerCase().indexOf('</body>'));
  });

  it('uses the LAST </body> when the markup somehow has several', () => {
    const out = appendTrackingPixel('<body>a</body><body>b</body>', pixel);
    expect(out.split('<img').length - 1).toBe(1);
    expect(out.endsWith('</body>')).toBe(true);
  });

  it('appends when there is no body tag (bare fragment)', () => {
    expect(appendTrackingPixel('<p>hi</p>', pixel)).toBe(`<p>hi</p><img src="${pixel}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden;" />`);
  });

  it('is a no-op without a pixel url, and tolerates nullish html', () => {
    expect(appendTrackingPixel('<p>hi</p>', '')).toBe('<p>hi</p>');
    expect(appendTrackingPixel(undefined as any, pixel)).toContain('<img');
  });
});
