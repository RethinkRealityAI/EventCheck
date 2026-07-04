import type { DateBracket, PricingPromoConfig } from '../types';

export function isPromoActive(cfg: PricingPromoConfig, now: Date): boolean {
  if (!cfg?.enabled) return false;
  if (cfg.endDate) {
    const end = new Date(`${cfg.endDate}T23:59:59.999Z`).getTime();
    if (now.getTime() > end) return false;
  }
  return true;
}

export function shouldShowForCategory(cfg: PricingPromoConfig, categoryKey: string): boolean {
  return cfg.categories === 'all' || cfg.categories.includes(categoryKey);
}

/** Preset Tailwind classes, or `custom:bg:text` token for inline styles. */
export function promoColors(cfg: PricingPromoConfig): string {
  switch (cfg.colorPreset) {
    case 'gansid-red':
      return 'bg-gansid-primary-gradient text-white';
    case 'gansid-blue':
      return 'bg-gansid-secondary text-white';
    case 'save-green':
      return 'bg-emerald-500 text-white';
    case 'amber':
      return 'bg-amber-500 text-white';
    case 'custom':
      return `custom:${cfg.customBg ?? '#059669'}:${cfg.customText ?? '#ffffff'}`;
    default: {
      const _exhaustive: never = cfg.colorPreset;
      return _exhaustive;
    }
  }
}

export function parseCustomPromoStyle(token: string): { backgroundColor: string; color: string } | undefined {
  if (!token.startsWith('custom:')) return undefined;
  const [, bg, text] = token.split(':');
  if (!bg) return undefined;
  return { backgroundColor: bg, color: text ?? '#ffffff' };
}

/** Match CMS fee period label to a pricing-engine bracket (case-insensitive name). */
export function matchBracketToPeriod(
  brackets: DateBracket[],
  periodLabel: string,
): DateBracket | null {
  const needle = periodLabel.trim().toLowerCase();
  if (!needle) return null;
  return brackets.find((b) => b.name.trim().toLowerCase() === needle)
    ?? brackets.find((b) => b.name.trim().toLowerCase().includes(needle))
    ?? null;
}
