import { describe, it, expect } from 'vitest';
import { applyPlaceholders, renderEmailShell } from '../supabase/functions/_shared/emailShell';

describe('applyPlaceholders', () => {
  it('substitutes known tokens', () => {
    expect(applyPlaceholders('Hello {{name}}, event {{event}}', { name: 'Dapo', event: 'Congress' }))
      .toBe('Hello Dapo, event Congress');
  });

  it('scrubs unresolved tokens to empty string (no raw {{…}} ever ships)', () => {
    expect(applyPlaceholders('Hi {{name}} {{first_name}} {{unknown}}', { name: 'Dapo' }))
      .toBe('Hi Dapo  ');
  });

  it('treats null/undefined var values as empty', () => {
    expect(applyPlaceholders('A{{x}}B', { x: undefined })).toBe('AB');
    expect(applyPlaceholders('A{{x}}B', { x: null as any })).toBe('AB');
  });

  it('replaces every occurrence of a repeated token', () => {
    expect(applyPlaceholders('{{n}}-{{n}}', { n: '7' })).toBe('7-7');
  });

  it('substitutes spaced tokens like {{ name }}', () => {
    expect(applyPlaceholders('Hi {{ name }}!', { name: 'Dapo' })).toBe('Hi Dapo!');
  });

  it('still scrubs UNKNOWN spaced tokens', () => {
    expect(applyPlaceholders('Hi {{ unknown }}!', { name: 'Dapo' })).toBe('Hi !');
  });

  it('leaves text with no tokens untouched', () => {
    expect(applyPlaceholders('plain text', { a: 'b' })).toBe('plain text');
  });

  it('coerces numeric var values to strings', () => {
    expect(applyPlaceholders('count: {{n}}', { n: 42 })).toBe('count: 42');
  });
});

describe('renderEmailShell (shared)', () => {
  it('renders the header image when headerImageUrl is provided', () => {
    const html = renderEmailShell({ site: 'gansid', content: '<p>hi</p>', headerImageUrl: 'https://x/y.png' });
    expect(html).toContain('src="https://x/y.png"');
    // Image replaces the wordmark MARKUP. (The bare substring 'header-brand-title'
    // always appears in the <style> block's CSS rule, so assert on the rendered
    // element instead.)
    expect(html).not.toContain('class="header-brand-title"');
  });

  it('falls back to the wordmark when no image', () => {
    const html = renderEmailShell({ site: 'scago', content: '<p>hi</p>' });
    expect(html).toContain('header-brand-title');
    expect(html).toContain('SCAGO');
  });
});
