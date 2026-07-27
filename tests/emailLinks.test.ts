import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildAppUrl,
  isAbsoluteHttpUrl,
  normalizeOrigin,
  resolveOrigin,
} from '../supabase/functions/_shared/emailLinks';
import { applyPlaceholders, stripDeadLinks, renderEmailShell } from '../utils/emailShell';

describe('isAbsoluteHttpUrl', () => {
  it('accepts http and https', () => {
    expect(isAbsoluteHttpUrl('https://gansid.netlify.app')).toBe(true);
    expect(isAbsoluteHttpUrl('http://localhost:5173')).toBe(true);
  });

  it('rejects the relative paths that used to ship as dead links', () => {
    expect(isAbsoluteHttpUrl('/#/tickets?token=abc')).toBe(false);
    expect(isAbsoluteHttpUrl('')).toBe(false);
    expect(isAbsoluteHttpUrl('   ')).toBe(false);
    expect(isAbsoluteHttpUrl('gansid.netlify.app')).toBe(false);
  });

  it('rejects non-strings', () => {
    expect(isAbsoluteHttpUrl(null)).toBe(false);
    expect(isAbsoluteHttpUrl(undefined)).toBe(false);
    expect(isAbsoluteHttpUrl(42)).toBe(false);
  });
});

describe('normalizeOrigin', () => {
  it('strips trailing slashes and paths down to scheme + host', () => {
    expect(normalizeOrigin('https://gansid.netlify.app/')).toBe('https://gansid.netlify.app');
    expect(normalizeOrigin('https://gansid.netlify.app/#/portal')).toBe('https://gansid.netlify.app');
    expect(normalizeOrigin('  https://gansid.netlify.app  ')).toBe('https://gansid.netlify.app');
  });

  it('keeps the port', () => {
    expect(normalizeOrigin('http://localhost:5173')).toBe('http://localhost:5173');
  });

  it('returns empty for anything unusable', () => {
    expect(normalizeOrigin('/#/')).toBe('');
    expect(normalizeOrigin(undefined)).toBe('');
  });
});

describe('resolveOrigin', () => {
  it('takes the first usable candidate', () => {
    expect(resolveOrigin('https://a.test', 'https://b.test')).toBe('https://a.test');
  });

  it('skips an empty-string candidate instead of letting it win (the ?? bug)', () => {
    expect(resolveOrigin('', null, 'https://fallback.test')).toBe('https://fallback.test');
  });

  it('skips a relative candidate and falls through to PUBLIC_SITE_URL', () => {
    expect(resolveOrigin('/#/', 'https://fallback.test')).toBe('https://fallback.test');
  });

  it('returns empty when nothing resolves', () => {
    expect(resolveOrigin(undefined, null, '')).toBe('');
  });
});

describe('buildAppUrl', () => {
  it('joins origin and path', () => {
    expect(buildAppUrl('https://gansid.netlify.app', '/#/tickets?token=x'))
      .toBe('https://gansid.netlify.app/#/tickets?token=x');
  });

  it('tolerates a missing leading slash', () => {
    expect(buildAppUrl('https://a.test', '#/')).toBe('https://a.test/#/');
  });

  it('returns empty — never a relative path — when the origin is unusable', () => {
    expect(buildAppUrl('', '/#/tickets?token=x')).toBe('');
    expect(buildAppUrl('/#/', '/#/tickets')).toBe('');
  });
});

describe('stripDeadLinks', () => {
  it('drops an anchor whose href and text both resolved to nothing', () => {
    expect(stripDeadLinks('<p>Create an account: <a href=""></a></p>'))
      .toBe('<p>Create an account: </p>');
  });

  it('unwraps a dead link but keeps its visible text', () => {
    expect(stripDeadLinks('<p><a href="">Complete my registration</a></p>'))
      .toBe('<p>Complete my registration</p>');
  });

  it('unwraps relative hrefs — an inbox cannot resolve them', () => {
    expect(stripDeadLinks('<a href="/#/tickets?token=x">Download</a>')).toBe('Download');
  });

  it('leaves absolute links, mailto and tel alone', () => {
    const html = '<a href="https://a.test/#/x">Go</a><a href="mailto:a@b.com">Mail</a><a href="tel:+1">Call</a>';
    expect(stripDeadLinks(html)).toBe(html);
  });

  it('leaves unresolved placeholders alone so admin previews still show them', () => {
    const html = '<a href="{{signup_url}}">{{signup_url}}</a>';
    expect(stripDeadLinks(html)).toBe(html);
  });

  it('preserves a button that survived, alongside one that did not', () => {
    const html = '<a href="https://a.test">Keep</a> and <a href="">Drop</a>';
    expect(stripDeadLinks(html)).toBe('<a href="https://a.test">Keep</a> and Drop');
  });
});

describe('applyPlaceholders', () => {
  afterEach(() => vi.restoreAllMocks());

  it('substitutes known tokens, with or without spaces', () => {
    expect(applyPlaceholders('Hi {{name}} / {{ name }}', { name: 'Rabi' })).toBe('Hi Rabi / Rabi');
  });

  it('still scrubs unknown tokens so raw syntax never reaches a recipient', () => {
    expect(applyPlaceholders('Link: {{mystery_url}}', { name: 'Rabi' })).toBe('Link: ');
  });

  it('warns with the context when a token is unknown', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyPlaceholders('Link: {{mystery_url}}', { name: 'Rabi' }, 'bogo-claim-link');
    expect(warn).toHaveBeenCalledOnce();
    const payload = String(warn.mock.calls[0][1]);
    expect(payload).toContain('bogo-claim-link');
    expect(payload).toContain('mystery_url');
  });

  it('warns when a supplied value is empty — the silent missing-link case', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyPlaceholders('Account: {{signup_url}}', { signup_url: '' }, 'guest-claim-completed');
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][1])).toContain('signup_url');
  });

  it('stays quiet when everything resolved', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    applyPlaceholders('Hi {{name}}', { name: 'Rabi' }, 'group-invite');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('renderEmailShell integration', () => {
  it('never emits an empty-href anchor, even if the template had one', () => {
    const content = applyPlaceholders(
      '<p>Portal: <a href="{{signup_url}}">{{signup_url}}</a></p>',
      { signup_url: '' },
      'test',
    );
    const html = renderEmailShell({ site: 'gansid', content });
    expect(html).not.toContain('href=""');
    expect(html).toContain('Portal:');
  });

  it('keeps a real link intact end to end', () => {
    const content = applyPlaceholders(
      '<p><a href="{{complete_url}}">Complete my registration</a></p>',
      { complete_url: 'https://gansid.netlify.app/#/form/f1?ref=a1' },
      'test',
    );
    expect(renderEmailShell({ site: 'gansid', content }))
      .toContain('href="https://gansid.netlify.app/#/form/f1?ref=a1"');
  });
});
