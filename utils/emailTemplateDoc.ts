// The bridge between a ticket-email TEMPLATE (what the server renders: HTML with
// {{placeholders}} and {{#if flag}}…{{else}}…{{/if}} blocks) and the visual
// editor (components/Email/TicketEmailEditor), which shows the same thing as
// chips, buttons and labelled "show only if…" sections so a non-technical admin
// never edits a tag by hand.
//
// Design: the editor's own output is already email-ready. Every custom editor
// node serialises to the exact inline-styled markup an inbox needs (a styled
// <a> button, a centred QR <img>, a shaded details box), tagged with a
// `data-block` / `data-variable` marker so it parses back into the same node.
// The only structural translation is for conditions, which the editor holds as
// nested blocks and the server reads as {{#if}} tokens.
//
// Browser-only (DOMParser). Unit-tested under jsdom in tests/emailTemplateDoc.test.ts.

export const EMAIL_STYLES = {
  button: 'display:inline-block;padding:12px 24px;background:#1E4A8C;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;',
  buttonWrap: 'text-align:center;margin:20px 0;',
  link: 'color:#1E4A8C;font-weight:600;',
  callout: 'background:#f3f6fb;border-radius:8px;padding:12px 16px;margin:16px 0;',
  qrWrap: 'text-align:center;margin:16px 0;',
  qrImg: 'border:1px solid #e5e7eb;border-radius:8px;padding:8px;background:#fff;',
} as const;

/** Personal details an admin can drop into the text. Keys match the server's placeholders. */
export const TEMPLATE_VARIABLES = [
  { key: 'name', label: 'Full name', example: 'Priyanka Mishra' },
  { key: 'first_name', label: 'First name', example: 'Priyanka' },
  { key: 'email', label: 'Email address', example: 'name@example.com' },
  { key: 'ticket_type', label: 'Ticket category', example: 'Patients or Family Members' },
  { key: 'booking_ref', label: 'Booking reference', example: 'REG-00036' },
  { key: 'purchaser', label: 'Booked by', example: 'Yukta Gulati' },
  { key: 'event', label: 'Event name', example: 'GANSID Congress 2026' },
] as const;

/** Where a button or link can point. Each is personalised per recipient by the server. */
export const LINK_TARGETS = [
  { key: 'account_url', label: 'Create-account link', hint: 'Signs them up with their ticket already attached' },
  { key: 'portal_url', label: 'Sign-in page', hint: 'For people who already have an account' },
  { key: 'ticket_download_url', label: 'Ticket download', hint: 'Opens their ticket PDF' },
] as const;

/** The three facts a section can depend on, phrased as the admin reads them. */
export const CONDITION_FLAGS = [
  { key: 'has_account', label: 'Whether they have an account', short: 'Has an account?', yes: 'They already have an account', no: 'They don’t have an account yet' },
  { key: 'is_companion', label: 'Whether someone else booked them', short: 'Booked by someone else?', yes: 'Someone else booked them (companion)', no: 'They booked it themselves' },
  { key: 'has_companions', label: 'Whether they booked for others', short: 'Booked for others?', yes: 'They booked for other people', no: 'They didn’t book for anyone else' },
] as const;

export type ConditionFlag = (typeof CONDITION_FLAGS)[number]['key'];

export function variableLabel(key: string): string {
  return TEMPLATE_VARIABLES.find(v => v.key === key)?.label
    ?? (key === 'companions' ? 'People they booked for' : key.replace(/_/g, ' '));
}
export function linkTargetFromHref(href: string | null | undefined): string | null {
  const m = /^\{\{\s*([\w-]+)\s*\}\}$/.exec(String(href ?? '').trim());
  return m ? m[1] : null;
}

// ── Email-ready snippets (also the drag-and-drop payloads) ──────────────────
const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const snippet = {
  variable: (key: string) => `<span data-variable="${esc(key)}">{{${esc(key)}}}</span>`,
  button: (label: string, href: string) =>
    `<p data-block="button" style="${EMAIL_STYLES.buttonWrap}"><a href="${esc(href)}" style="${EMAIL_STYLES.button}">${esc(label)}</a></p>`,
  qr: () =>
    `<div data-block="qr" style="${EMAIL_STYLES.qrWrap}"><img src="{{qr_image_url}}" alt="Check-in QR code" width="200" height="200" style="${EMAIL_STYLES.qrImg}" /></div>`,
  companions: () => `<div data-block="companions">{{companions}}</div>`,
  callout: (innerHtml: string) => `<div data-block="callout" style="${EMAIL_STYLES.callout}">${innerHtml}</div>`,
  condition: (flag: string, thenHtml: string, elseHtml = '') =>
    `{{#if ${flag}}}${thenHtml}${elseHtml ? `{{else}}${elseHtml}` : ''}{{/if}}`,
};

const IF_BLOCK = /\{\{\s*#if\s+([\w-]+)\s*\}\}([\s\S]*?)(?:\{\{\s*else\s*\}\}([\s\S]*?))?\{\{\s*\/if\s*\}\}/g;
const TOKEN = /\{\{\s*([\w.-]+)\s*\}\}/g;

function parseBody(html: string): { doc: Document; body: HTMLElement } {
  const doc = new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, 'text/html');
  return { doc, body: doc.body };
}

function styleOf(el: Element): string {
  return (el.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
}

/**
 * Stored template → the HTML the editor loads. Conditions become nested blocks;
 * bare {{tokens}} in text become variable chips; markup written before the
 * editor existed (a hand-styled button, the QR image, a shaded box) is
 * recognised and tagged so it lands as the matching block, not loose HTML.
 */
export function templateToEditorHtml(template: string): string {
  let s = String(template ?? '');
  // A companions list is a block of its own wherever it appears.
  s = s.replace(/<div data-block="companions">\s*\{\{\s*companions\s*\}\}\s*<\/div>/g, '{{companions}}')
       .replace(/\{\{\s*companions\s*\}\}/g, snippet.companions());
  s = s.replace(IF_BLOCK, (_m, flag: string, yes: string, no?: string) =>
    `<div data-cond="${flag}"><div data-branch="then">${yes}</div><div data-branch="else">${no ?? ''}</div></div>`);

  const { doc, body } = parseBody(s);

  // Legacy button: a paragraph whose only content is an inline-block link.
  body.querySelectorAll('p:not([data-block])').forEach(p => {
    const kids = Array.from(p.childNodes).filter(n => !(n.nodeType === 3 && !n.textContent?.trim()));
    const a = kids.length === 1 && kids[0].nodeName === 'A' ? (kids[0] as HTMLAnchorElement) : null;
    if (a && styleOf(a).includes('display:inline-block')) p.setAttribute('data-block', 'button');
  });
  // Legacy QR: whatever block holds the {{qr_image_url}} image.
  body.querySelectorAll('img').forEach(img => {
    if (!/\{\{\s*qr_image_url\s*\}\}/.test(img.getAttribute('src') || '')) return;
    const holder = img.closest('div, p');
    if (holder && !holder.hasAttribute('data-block')) holder.setAttribute('data-block', 'qr');
  });
  // Legacy shaded box → callout holding one paragraph (its <br> lines intact).
  body.querySelectorAll('p[style], div[style]').forEach(el => {
    if (el.hasAttribute('data-block') || !/background/.test(styleOf(el))) return;
    const box = doc.createElement('div');
    box.setAttribute('data-block', 'callout');
    const hasBlocks = !!el.querySelector('p, ul, ol, h1, h2, h3');
    box.innerHTML = hasBlocks ? el.innerHTML : `<p>${el.innerHTML}</p>`;
    el.replaceWith(box);
  });

  // Text links: their style is re-applied on save. Left in, the editor reads
  // its font-weight as bold and wraps every link in <strong>.
  body.querySelectorAll('a').forEach(a => {
    if (!a.closest('[data-block="button"]')) a.removeAttribute('style');
  });

  // {{token}} in running text → a variable chip. Attributes (href/src) and
  // the insides of blocks and chips are left alone.
  const walker = doc.createTreeWalker(body, 4 /* NodeFilter.SHOW_TEXT */);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const t of texts) {
    if (!TOKEN.test(t.data)) continue;
    TOKEN.lastIndex = 0;
    if (t.parentElement?.closest('[data-variable], [data-block="companions"]')) continue;
    const frag = doc.createDocumentFragment();
    let last = 0;
    t.data.replace(TOKEN, (m, key: string, idx: number) => {
      if (idx > last) frag.appendChild(doc.createTextNode(t.data.slice(last, idx)));
      const span = doc.createElement('span');
      span.setAttribute('data-variable', key);
      span.textContent = `{{${key}}}`;
      frag.appendChild(span);
      last = idx + m.length;
      return m;
    });
    if (last < t.data.length) frag.appendChild(doc.createTextNode(t.data.slice(last)));
    t.replaceWith(frag);
  }
  return body.innerHTML;
}

/** Is a branch effectively empty (just blank paragraphs)? */
function isBlankBranch(el: Element | null): boolean {
  if (!el) return true;
  if (el.querySelector('[data-block], [data-variable], img, a')) return false;
  return !(el.textContent || '').trim();
}

/**
 * Editor HTML → stored template. Only conditions need translating; everything
 * else the editor emits is already the markup an inbox renders. Top-level
 * blocks go on their own lines so the "Edit HTML" view stays readable.
 */
export function editorHtmlToTemplate(html: string): string {
  const { body } = parseBody(html);

  // Links typed in the editor get the brand link colour, like the presets.
  body.querySelectorAll('a').forEach(a => {
    if (a.closest('[data-block="button"]')) return;
    if (!a.getAttribute('style')) a.setAttribute('style', EMAIL_STYLES.link);
    a.removeAttribute('target');
    a.removeAttribute('rel');
    a.removeAttribute('class');
  });
  // Blank trailing paragraphs are editor artefacts, not content.
  body.querySelectorAll('p').forEach(p => {
    if (!p.hasAttribute('data-block') && !p.childNodes.length) p.remove();
  });

  const out: string[] = [];
  const conds: Array<{ marker: string; html: string }> = [];
  body.querySelectorAll('[data-cond]').forEach((el, i) => {
    const flag = el.getAttribute('data-cond') || '';
    const yes = el.querySelector(':scope > [data-branch="then"]');
    const no = el.querySelector(':scope > [data-branch="else"]');
    const join = (b: Element | null) => (b ? Array.from(b.children).map(c => c.outerHTML).join('\n') : '');
    const marker = `__COND_${i}__`;
    conds.push({ marker, html: snippet.condition(flag, join(yes), isBlankBranch(no) ? '' : join(no)) });
    el.replaceWith(body.ownerDocument.createTextNode(marker));
  });
  for (const node of Array.from(body.childNodes)) {
    const piece = node.nodeType === 1 ? (node as Element).outerHTML : (node.textContent || '');
    if (piece.trim()) out.push(piece.trim());
  }
  let result = out.join('\n');
  for (const c of conds) result = result.replace(c.marker, c.html);
  return result;
}
