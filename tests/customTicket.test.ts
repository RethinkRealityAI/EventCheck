import { describe, it, expect } from 'vitest';
import {
  renderConditionals,
  strayConditionalTokens,
  buildCompanionListHtml,
  eventDisplayName,
  type CompanionTicket,
} from '../supabase/functions/_shared/customTicket';

describe('renderConditionals', () => {
  it('picks the branch for each flag', () => {
    const t = 'A{{#if has_account}}yes{{else}}no{{/if}}B';
    expect(renderConditionals(t, { has_account: true })).toBe('AyesB');
    expect(renderConditionals(t, { has_account: false })).toBe('AnoB');
  });

  it('treats an unknown flag as false and a missing else as empty', () => {
    expect(renderConditionals('x{{#if nope}}shown{{/if}}y', {})).toBe('xy');
  });

  it('handles several blocks, spaces inside braces and multi-line bodies', () => {
    const t = '{{ #if is_companion }}\n<p>guest</p>\n{{ else }}<p>booker</p>{{ /if }}|{{#if has_companions}}<ul></ul>{{/if}}';
    expect(renderConditionals(t, { is_companion: false, has_companions: true })).toBe('<p>booker</p>|<ul></ul>');
  });

  it('leaves placeholders alone for the later merge', () => {
    expect(renderConditionals('{{#if has_account}}{{portal_url}}{{else}}{{account_url}}{{/if}}', { has_account: false }))
      .toBe('{{account_url}}');
  });

  it('reports tokens a malformed block left behind', () => {
    const out = renderConditionals('{{#if has_account}}open but never closed', { has_account: true });
    expect(strayConditionalTokens(out)).toEqual(['{{#if has_account}}']);
    expect(strayConditionalTokens('clean')).toEqual([]);
  });
});

describe('buildCompanionListHtml', () => {
  const base: CompanionTicket = {
    name: 'Anuj <Patel>', ticketType: 'Registration (Free Add-on)', sharesRecipientEmail: true,
    email: null, hasOwnAccount: false, accountUrl: 'https://x/#/account?token=a.b', pdfAttached: true,
  };

  it('is empty with no companions', () => {
    expect(buildCompanionListHtml([], '')).toBe('');
  });

  it('shared-inbox companion: attached, needs their own email, gets the link; name escaped', () => {
    const html = buildCompanionListHtml([base], 'color:#1E4A8C');
    expect(html).toContain('Anuj &lt;Patel&gt;');
    expect(html).toContain('attached to this email');
    expect(html).toContain('their own email address');
    expect(html).toContain('stays in yours as well');
    expect(html).toContain('href="https://x/#/account?token=a.b"');
    expect(html).not.toContain('We have also sent it');
  });

  it('own-address companion: says where it was sent, never claims a missing attachment', () => {
    const html = buildCompanionListHtml([{ ...base, sharesRecipientEmail: false, email: 'a@b.org', pdfAttached: false }], '');
    expect(html).toContain('sent it to them at a@b.org');
    expect(html).not.toContain('attached');
    expect(html).toContain('create their own account');
  });

  it('no account link for someone who already has an account', () => {
    const html = buildCompanionListHtml([{ ...base, hasOwnAccount: true, sharesRecipientEmail: false, email: 'a@b.org' }], '');
    expect(html).toContain('already have their own account');
    expect(html).not.toContain('href=');
  });
});

describe('eventDisplayName', () => {
  it('drops a trailing "Registration" from the form title', () => {
    expect(eventDisplayName('GANSID Congress 2026 Registration')).toBe('GANSID Congress 2026');
    expect(eventDisplayName('Hope Gala')).toBe('Hope Gala');
    expect(eventDisplayName('')).toBe('the event');
  });
});
