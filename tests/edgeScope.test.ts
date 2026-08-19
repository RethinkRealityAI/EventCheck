import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { findOutOfScopeRefs } from '../scripts/check-edge-scope.mjs';

describe('findOutOfScopeRefs', () => {
  it('catches the exact regression that took down free-registration invites', () => {
    // 2026-08-19: `headerImageUrl: tpl.headerImageUrl` was added to
    // contact-register-invite, which receives pre-composed html and declares no
    // `tpl`. Every send threw ReferenceError -> 500 on both tenants. tsc could
    // not see it (@ts-nocheck) and CI had no check.
    const src = [
      `if (body.mode === 'group-invite') {`,
      `    const tpl = resolveEmailTemplate({ globalBody: x });`,
      `    await sendSimpleEmail({ to, subject, html, headerImageUrl: tpl.headerImageUrl });`,
      `}`,
      `if (body.mode === 'contact-register-invite') {`,
      `    const s = (appSettings as any) || {};`,
      `    await sendSimpleEmail({ to, subject, html, headerImageUrl: tpl.headerImageUrl });`,
      `}`,
    ].join('\n');

    const findings = findOutOfScopeRefs(src);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ mode: 'contact-register-invite', name: 'tpl' });
  });

  it('does not flag a local declared inside its own mode block', () => {
    const src = [
      `if (body.mode === 'bogo-ticket') {`,
      `    const tpl = resolveEmailTemplate({});`,
      `    const bogoPdf = await buildTicketPdfAttachment(free, form, appSettings);`,
      `    const html = render({ headerImageUrl: tpl.headerImageUrl });`,
      `    send({ attachments: bogoPdf ? [a] : [] });`,
      `}`,
    ].join('\n');
    expect(findOutOfScopeRefs(src)).toHaveLength(0);
  });

  it('catches a *Pdf local leaking across sibling mode blocks', () => {
    // The second half of the same incident: bogo-ticket-updated referenced
    // `bogoPdf`, which belongs to bogo-ticket.
    const src = [
      `if (body.mode === 'bogo-ticket') {`,
      `    const bogoPdf = await buildTicketPdfAttachment(a, b, c);`,
      `}`,
      `if (body.mode === 'bogo-ticket-updated') {`,
      `    send({ attachments: bogoPdf ? [x] : [] });`,
      `}`,
    ].join('\n');
    const findings = findOutOfScopeRefs(src);
    expect(findings.map((f: any) => f.mode)).toContain('bogo-ticket-updated');
  });

  it('the real send-ticket-email source is currently clean', () => {
    const src = readFileSync('supabase/functions/send-ticket-email/index.ts', 'utf8');
    expect(findOutOfScopeRefs(src)).toEqual([]);
  });
});
