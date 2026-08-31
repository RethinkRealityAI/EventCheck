// Resolution of the India partner-page routing config (see
// components/payments/IndiaGate.tsx for the UI it drives). Pure so the
// enable/override/kill-switch rules are unit-testable.

export interface IndiaPartnerConfig {
  pageUrl: string;
  partnerName: string;
}

export interface IndiaPartnerSettings {
  enabled?: boolean;
  pageUrl?: string;
  partnerName?: string;
}

export const DEFAULT_INDIA_PARTNER_FORM = 'gansid-congress-2026';
export const DEFAULT_INDIA_PARTNER_URL = 'https://www.tscsindia.org/gansid-registration/';
export const DEFAULT_INDIA_PARTNER_NAME = 'TSCS India';

/**
 * Enabled via `forms.settings.indiaPartner` (additive jsonb — no migration),
 * with a built-in default for the GANSID Congress 2026 form so the flow works
 * without an admin settings edit. `enabled: false` always wins.
 */
export function resolveIndiaPartner(
  formId: string | undefined,
  settings: { indiaPartner?: IndiaPartnerSettings } | undefined,
): IndiaPartnerConfig | null {
  const s = settings?.indiaPartner;
  if (s?.enabled === false) return null;
  const isDefaultForm = formId === DEFAULT_INDIA_PARTNER_FORM;
  if (!s?.enabled && !isDefaultForm) return null;
  return {
    pageUrl: s?.pageUrl || DEFAULT_INDIA_PARTNER_URL,
    partnerName: s?.partnerName || DEFAULT_INDIA_PARTNER_NAME,
  };
}
