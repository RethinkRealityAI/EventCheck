// supabase/functions/_shared/siteOrigin.ts
//
// Edge-only (reads Deno.env): the origin a SIGNED or otherwise sensitive link
// may be built on. A caller-supplied origin (body.origin, the Origin header)
// is used only when it is one of the app's own sites — see
// emailLinks.ts resolveTrustedOrigin, where the rule lives and is tested —
// otherwise PUBLIC_SITE_URL, otherwise ''. Never pass a caller origin to plain
// resolveOrigin for a link that carries a token: these functions are
// gateway-open, and that puts a live token on whatever host the caller named.

import { resolveTrustedOrigin, type TrustedOriginConfig } from './emailLinks.ts';

/** PUBLIC_SITE_URL + ALLOWED_LINK_ORIGINS for this project. */
export function siteOriginConfig(): TrustedOriginConfig {
  return {
    publicSiteUrl: Deno.env.get('PUBLIC_SITE_URL'),
    allowedOrigins: Deno.env.get('ALLOWED_LINK_ORIGINS'),
  };
}

/** First trusted caller candidate, else PUBLIC_SITE_URL, else ''. */
export function trustedSiteOrigin(...callerCandidates: unknown[]): string {
  return resolveTrustedOrigin(callerCandidates, siteOriginConfig());
}
