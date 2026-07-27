// Canonical site-aware email shell — the SINGLE source of truth for branded
// email HTML, shared by BOTH the Deno edge function (send-ticket-email) and the
// Vite client (admin preview + browser-side email helpers import it via the
// utils/emailShell re-export). Pure module: zero imports, no Deno/Node APIs.
//
// Design contract:
//  - GANSID: tri-stop gradient header (crimson → red → navy) and the same
//    gradient footer. Single branded surface — no nested cards.
//  - SCAGO:  SCAGO red header + red footer. Same single-surface design.
//  - Plain `content` is dropped inside a shared .body wrapper. Callers are
//    expected to pre-render their own placeholders before calling this.
//  - `previewMode` tightens margins + disables internal scrolling so the
//    rendered email fits inside an admin iframe without scrollbars.

// Self-contained so both the Deno edge runtime and the Vite client can import
// this file. Structurally identical to config/sites.ts SiteKey.
export type SiteKey = 'gansid' | 'scago';

export interface EmailPalette {
  headerGradient: string;
  footerGradient: string;
  buttonGradient: string;
  buttonColor: string;
  footerBrandLabel: string;
  footerSubtitle: string;
  footerContactEmail: string;
}

export const EMAIL_PALETTES: Record<SiteKey, EmailPalette> = {
  gansid: {
    headerGradient: 'linear-gradient(135deg, #ba0028 0%, #E0243C 38%, #2260a1 100%)',
    footerGradient: 'linear-gradient(135deg, #ba0028 0%, #E0243C 42%, #2260a1 100%)',
    buttonGradient: 'linear-gradient(135deg, #ba0028, #E0243C)',
    buttonColor: '#ba0028',
    footerBrandLabel: 'GANSID Congress 2026',
    footerSubtitle: 'Hyderabad, India · October 23–25, 2026',
    footerContactEmail: 'congress@inheritedblooddisorders.world',
  },
  scago: {
    headerGradient: 'linear-gradient(135deg, #B3282D 0%, #8B1F24 100%)',
    footerGradient: 'linear-gradient(135deg, #B3282D 0%, #8B1F24 100%)',
    buttonGradient: 'linear-gradient(135deg, #B3282D, #D63E43)',
    buttonColor: '#B3282D',
    footerBrandLabel: 'SCAGO',
    footerSubtitle: 'Sickle Cell Awareness Group of Ontario',
    footerContactEmail: 'info@scago.ca',
  },
};

export interface EmailShellOptions {
  /** Body HTML to embed — already placeholder-resolved. */
  content: string;
  site: SiteKey;
  /** Optional image rendered in the gradient header. Falls back to a centred brand wordmark. */
  headerImageUrl?: string;
  /** Optional subject line (NOT rendered inside the body — passed through for reference). */
  subject?: string;
  /** Replaces the default palette footer copy when provided. */
  footerText?: string;
  /** Tightens margins + disables internal scroll — used only in admin iframe preview. */
  previewMode?: boolean;
  /** Full URL to a 1×1 open tracking pixel. Omit for preview mode / non-tracked sends. */
  trackingPixelUrl?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Last line of defence against dead links. An `<a>` whose href resolved to
 * nothing — an empty string, a bare '#', or a relative path an inbox can't
 * resolve — is unwrapped to its own text, and dropped entirely when that text
 * is itself empty (the `<a href="{{signup_url}}">{{signup_url}}</a>` shape,
 * which collapses to an invisible link once the placeholder resolves empty).
 *
 * Recipients then see a sentence with no link rather than a button that looks
 * clickable and goes nowhere — and the missing link shows up in the logs via
 * applyPlaceholders' warning rather than in a support email a week later.
 *
 * `mailto:` and `tel:` are left alone; so is any absolute http(s) URL.
 */
export function stripDeadLinks(html: string): string {
  if (!html) return html;
  return html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a>/gi,
    (whole: string, attrs: string, inner: string): string => {
      const hrefMatch = /\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
      const href = (hrefMatch ? (hrefMatch[2] ?? hrefMatch[3] ?? hrefMatch[4] ?? '') : '').trim();
      // No href at all: an anchor used as a target/name — leave it be.
      if (!hrefMatch) return whole;
      const isUsable = /^(https?:\/\/|mailto:|tel:)/i.test(href)
        // Unresolved placeholders are intentional in admin template previews.
        || /\{\{/.test(href);
      if (isUsable) return whole;
      return inner.replace(/<[^>]+>/g, '').trim() ? inner : '';
    },
  );
}

export function renderEmailShell(opts: EmailShellOptions): string {
  const palette = EMAIL_PALETTES[opts.site];
  const previewCss = opts.previewMode
    ? `html, body { overflow: hidden !important; }
    body { zoom: 0.78; }
    .container { margin: 12px auto !important; box-shadow: 0 2px 10px rgba(0,0,0,0.08) !important; }
    .body { padding: 28px 28px !important; }
    .body p:last-child { margin-bottom: 0 !important; }`
    : '';

  const pixelBlock = opts.trackingPixelUrl
    ? `<img src="${escapeHtml(opts.trackingPixelUrl)}" alt="" width="1" height="1" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden;" />`
    : '';

  const headerContent = opts.headerImageUrl
    ? `<img src="${escapeHtml(opts.headerImageUrl)}" alt="${escapeHtml(palette.footerBrandLabel)}" width="560" style="display:block; width:100%; max-width:560px; height:auto; border:0;">`
    : `<div class="header-brand">
        <div class="header-brand-title">${escapeHtml(palette.footerBrandLabel)}</div>
        <div class="header-brand-subtitle">${escapeHtml(palette.footerSubtitle)}</div>
      </div>`;

  const footerText = opts.footerText
    ? escapeHtml(opts.footerText)
    : `${escapeHtml(palette.footerSubtitle)}<br><br>Questions? <a href="mailto:${palette.footerContactEmail}">${palette.footerContactEmail}</a>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, sans-serif; color: #1a1c1c; }
    .container { max-width: 560px; margin: 40px auto; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${palette.headerGradient}; padding: 0; text-align: center; }
    .header-brand { padding: 44px 32px 40px; color: white; }
    .header-brand-title { font-size: 26px; font-weight: 800; letter-spacing: 1px; color: white; text-transform: uppercase; }
    .header-brand-subtitle { font-size: 13px; color: rgba(255,255,255,0.9); margin-top: 8px; }
    .body { padding: 40px 32px; }
    .body h1, .body h2, .body h3 { color: #1a1c1c; margin: 0 0 16px; line-height: 1.2; }
    .body h2 { font-size: 22px; }
    .body p { font-size: 16px; line-height: 1.6; color: #1a1c1c; opacity: 0.85; margin: 0 0 20px; }
    .body a { color: ${palette.buttonColor}; }
    .body .button, .body a.button { display: inline-block; background: ${palette.buttonGradient}; color: white !important; padding: 14px 32px; border-radius: 999px; text-decoration: none; font-weight: 600; font-size: 16px; }
    .body ul, .body ol { padding-left: 22px; margin: 0 0 20px; line-height: 1.6; color: #1a1c1c; opacity: 0.85; }
    .body blockquote { border-left: 3px solid ${palette.buttonColor}; margin: 0 0 20px; padding: 4px 16px; color: #4b5563; background: rgba(0,0,0,0.02); }
    .footer { padding: 28px 32px; background: ${palette.footerGradient}; text-align: center; font-size: 12px; color: rgba(255,255,255,0.92); }
    .footer a { color: white; text-decoration: underline; }
    .footer-brand { font-size: 13px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; color: white; margin-bottom: 6px; }
    ${previewCss}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">${headerContent}</div>
    <div class="body">
      ${stripDeadLinks(opts.content)}
    </div>
    <div class="footer">
      <div class="footer-brand">${escapeHtml(palette.footerBrandLabel)}</div>
      ${footerText}
    </div>
  </div>
  ${pixelBlock}
</body>
</html>`;
}

/**
 * Resolve placeholder tokens (e.g. `{{name}}`) in a template string.
 * Unknown tokens are left as-is so admins can discover which placeholders apply.
 */
export function mergePlaceholders(template: string, vars: Record<string, string | number | undefined | null>): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    const v = value === null || value === undefined ? '' : String(value);
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), v);
  }
  return out;
}

/** Escape body text before injecting into `.body` when the caller has plain text (not HTML). */
export function plainTextToHtml(plain: string): string {
  const trimmed = (plain || '').trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\n\s*\n/)
    .map(paragraph => `<p>${escapeHtml(paragraph.trim()).replace(/\n/g, '<br>')}</p>`)
    .filter(Boolean)
    .join('\n');
}

/**
 * Send-time placeholder resolution. Unlike `mergePlaceholders` (which leaves
 * unknown tokens intact for admin discovery in the PREVIEW), this replaces
 * known tokens AND strips any remaining `{{…}}` to empty — so a raw
 * placeholder can never reach a recipient's inbox.
 */
export function applyPlaceholders(
  template: string,
  vars: Record<string, string | number | undefined | null>,
  /** Names the send (e.g. 'bogo-claim-link') in the unresolved-token warning. */
  context?: string,
): string {
  const resolved = mergePlaceholders(template, vars);
  // Scrub any leftover {{token}} (letters, digits, _, -, ., optional spaces) to
  // empty so recipients never see raw template syntax.
  //
  // Scrubbing silently is how "the email arrived with no link" happens: a
  // template referencing a token this mode doesn't supply — or one supplied as
  // '' because an env var was unset — loses the link with no trace. Log what
  // was dropped so the next report is one grep away, and let stripDeadLinks
  // clean up the empty <a> the scrub leaves behind.
  const unresolved = new Set<string>();
  const out = resolved.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_m: string, token: string) => {
    unresolved.add(token);
    return '';
  });
  const emptied = Object.entries(vars)
    .filter(([, v]) => v === null || v === undefined || String(v).trim() === '')
    .map(([k]) => k);
  if (unresolved.size > 0 || emptied.length > 0) {
    console.warn('[email] placeholders resolved to nothing', JSON.stringify({
      context: context ?? 'unknown',
      unknownTokens: [...unresolved],
      emptyValues: emptied,
    }));
  }
  return out;
}
