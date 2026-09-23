import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// The Supabase Auth templates are pasted into the dashboard by hand, so no
// deploy step ever looks at them. This is the only thing that does. See
// supabase/templates/README.md for the incident behind each rule.
const DIR = 'supabase/templates';
// Comments are stripped first: the templates explain each rule by quoting the
// very pattern it forbids.
const withoutComments = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const templates = readdirSync(DIR)
  .filter(f => f.endsWith('.html'))
  .map(f => ({ file: f, html: withoutComments(readFileSync(`${DIR}/${f}`, 'utf8')) }));

describe('Supabase Auth email templates', () => {
  it('are captured in the repo', () => {
    expect(templates.map(t => t.file).sort()).toEqual(['confirm-signup.html', 'magic-link.html', 'reset-password.html']);
  });

  for (const { file, html } of templates) {
    describe(file, () => {
      it('never uses the background shorthand for a gradient', () => {
        // Clients that cannot draw a gradient drop the whole declaration and
        // keep `color: white` — the button turns invisible.
        expect(html).not.toMatch(/background\s*:\s*linear-gradient/i);
      });

      it('gives the button a solid colour inline, where <style> is stripped', () => {
        const button = html.match(/<a [^>]*class="button"[^>]*>/)?.[0] ?? '';
        expect(button).toMatch(/style="[^"]*background-color:#[0-9a-f]{6}/i);
        expect(button).toMatch(/style="[^"]*color:#ffffff/i);
      });

      it('links with token_hash, which works on any device', () => {
        // The client uses PKCE: a ConfirmationURL only completes in the
        // browser that asked for it.
        expect(html).not.toContain('{{ .ConfirmationURL }}');
        expect(html).toMatch(/token_hash=\{\{ \.TokenHash \}\}&amp;type=(signup|recovery|magiclink)/);
      });

      it('prints the link as text too, so a broken button is never a dead end', () => {
        // Button href + fallback href + the visible fallback text.
        const link = html.match(/\{\{ \.SiteURL \}\}\/#\/[a-z-]+\?token_hash=\{\{ \.TokenHash \}\}&amp;type=[a-z]+/)?.[0] ?? '';
        expect(link).not.toBe('');
        expect(html.split(link).length - 1).toBeGreaterThanOrEqual(3);
      });
    });
  }
});
