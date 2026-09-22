import { describe, it, expect } from 'vitest';
import { applyPlaceholders, emailButtonStyle, renderEmailShell, EMAIL_PALETTES } from '../supabase/functions/_shared/emailShell';

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

// ── The CTA button must survive a client that cannot draw a gradient ───────
//
// A portal registrant reported a confirmation email with no button: the header
// image rendered, the copy rendered, and where the button should be there was
// a blank gap. The cause is a one-property mistake with an outsized blast
// radius — `background: linear-gradient(...)` as a shorthand, plus
// `color: white`. Clients that do not support CSS gradients (Yahoo Mail,
// Outlook desktop, Gmail in several contexts) drop the whole declaration and
// keep the colour, leaving white text on the white card. The button is still
// there, still clickable, and completely invisible.
//
// These tests exist so nobody collapses those two properties back into one.

describe('CTA button styling', () => {
  for (const site of ['gansid', 'scago'] as const) {
    describe(site, () => {
      const css = renderEmailShell({ content: '<p>x</p>', site });
      const buttonRule = css.split('\n').find(l => l.includes('.body a.button')) ?? '';

      it('sets a solid background-color, not only a gradient', () => {
        expect(buttonRule).toContain(`background-color: ${EMAIL_PALETTES[site].buttonColor}`);
      });

      it('never uses a bare `background:` shorthand carrying the gradient', () => {
        // `background: linear-gradient(…)` is the exact shape that breaks.
        expect(buttonRule).not.toMatch(/background:\s*linear-gradient/);
      });

      it('keeps the gradient as decoration on top of the solid colour', () => {
        expect(buttonRule).toContain('background-image: linear-gradient');
      });

      it('offers the same styling inline, for clients that strip <style>', () => {
        const inline = emailButtonStyle(site);
        expect(inline).toContain(`background-color:${EMAIL_PALETTES[site].buttonColor}`);
        expect(inline).not.toMatch(/background:\s*linear-gradient/);
        expect(inline).toContain('color:#ffffff');
      });

      it('never leaves white text with no background to sit on', () => {
        // Whatever else changes, these two must move together.
        const hasWhiteText = /color:\s*#ffffff/i.test(buttonRule);
        const hasSolidBg = /background-color:\s*#[0-9a-f]{3,8}/i.test(buttonRule);
        expect(hasWhiteText && hasSolidBg).toBe(true);
      });
    });
  }
});
