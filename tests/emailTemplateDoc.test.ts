// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { templateToEditorHtml, editorHtmlToTemplate, snippet } from '../utils/emailTemplateDoc';
import { CUSTOM_TICKET_PRESETS } from '../utils/customTicketPresets';
import { ticketEmailNodes } from '../components/Email/TicketEmailEditor/extensions';
import { renderConditionals, strayConditionalTokens, CUSTOM_TICKET_FLAGS } from '../supabase/functions/_shared/customTicket';

// The editor must be lossless for what the SERVER cares about: every branch,
// placeholder, button target and the QR survive a trip through the real
// TipTap schema and back. Node views are React-only, so they are switched off
// here; parse/serialise rules are what is under test.
const nodes = ticketEmailNodes.map(n => n.extend({ addNodeView: () => null as any }));

function throughEditor(template: string): string {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({ code: false, codeBlock: false, heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: false, isAllowedUri: () => true } }),
      ...nodes,
    ],
    content: templateToEditorHtml(template),
  });
  const out = editorHtmlToTemplate(editor.getHTML());
  editor.destroy();
  return out;
}

const combos = Array.from({ length: 8 }, (_, n) =>
  Object.fromEntries(CUSTOM_TICKET_FLAGS.map((f, i) => [f, !!(n & (1 << i))])));

/** What a recipient reads: branches resolved, markup stripped to text + tokens + link targets.
 *  Whitespace is ignored: a newline between two blocks renders as nothing. */
function reading(template: string, flags: Record<string, boolean>): string {
  const html = renderConditionals(template, flags);
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const hrefs = Array.from(doc.querySelectorAll('a')).map(a => `[${a.textContent?.trim()}→${a.getAttribute('href')}]`);
  const imgs = Array.from(doc.querySelectorAll('img')).map(i => `[img ${i.getAttribute('src')}]`);
  return [(doc.body.textContent || '').replace(/\s+/g, ''), ...hrefs, ...imgs].join(' | ');
}

describe('ticket email editor round trip', () => {
  const tscs = CUSTOM_TICKET_PRESETS.find(p => p.id === 'tscs-india')!.body;

  it.each(combos)('TSCS preset reads the same after editing, for %o', (flags) => {
    const edited = throughEditor(tscs);
    expect(strayConditionalTokens(renderConditionals(edited, flags))).toEqual([]);
    expect(reading(edited, flags)).toBe(reading(tscs, flags));
  });

  it('is stable: a second trip changes nothing', () => {
    const once = throughEditor(tscs);
    expect(throughEditor(once)).toBe(once);
  });

  it('keeps the QR, buttons and companion list as email-ready markup', () => {
    const edited = throughEditor(tscs);
    expect(edited).toContain('src="{{qr_image_url}}"');
    expect(edited).toMatch(/<a href="\{\{account_url\}\}" style="display: ?inline-block[^"]*">Create my account<\/a>/);
    expect(edited).toContain('{{companions}}');
    expect(edited).toContain('{{#if has_account}}');
  });

  it('recognises the pre-editor markup (hand-styled button, QR div, shaded paragraph)', () => {
    const legacy = `<p>Hi {{first_name}},</p>
<p style="background:#f3f6fb;padding:12px;"><strong>Details</strong><br>Name: {{name}}</p>
<div style="text-align:center;"><img src="{{qr_image_url}}" /></div>
{{#if has_account}}<p style="text-align:center;"><a href="{{portal_url}}" style="display:inline-block;padding:12px;">Sign in</a></p>{{/if}}`;
    const html = templateToEditorHtml(legacy);
    expect(html).toContain('data-block="callout"');
    expect(html).toContain('data-block="qr"');
    expect(html).toContain('data-block="button"');
    expect(html).toContain('<span data-variable="first_name">{{first_name}}</span>');
    const edited = throughEditor(legacy);
    for (const flags of combos) expect(reading(edited, flags)).toBe(reading(legacy, flags));
  });

  it('drops an empty "otherwise" instead of emitting a blank {{else}}', () => {
    const t = snippet.condition('is_companion', '<p>Guest copy</p>');
    const edited = throughEditor(t);
    expect(edited).toContain('{{#if is_companion}}');
    expect(edited).not.toContain('{{else}}');
  });

  it('leaves placeholders inside link and image attributes alone', () => {
    const html = templateToEditorHtml('<p><a href="{{ticket_download_url}}">Download</a></p>');
    expect(html).toContain('href="{{ticket_download_url}}"');
    expect(html).not.toContain('data-variable="ticket_download_url"');
  });
});
