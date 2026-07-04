import type { CSSProperties } from 'react';
import type { PricingPromoConfig } from '../../types';
import { formatPrice } from '../../utils/pricing';
import { isPromoActive, promoColors, parseCustomPromoStyle } from '../../utils/pricingPromo';

export function PromoPrice({
  oldPrice,
  newPrice,
  currency = 'USD',
  config,
  compact = false,
}: {
  oldPrice?: number;
  newPrice: number;
  currency?: string;
  config: PricingPromoConfig;
  compact?: boolean;
}) {
  if (!isPromoActive(config, new Date())) {
    return <span>${newPrice}</span>;
  }

  const colorToken = promoColors(config);
  const customStyle = parseCustomPromoStyle(colorToken);
  const pillClass = customStyle
    ? 'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide'
    : `inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-display font-bold uppercase tracking-wide ${colorToken}`;

  const pillStyle: CSSProperties | undefined = customStyle ?? undefined;

  return (
    <span className={`inline-flex flex-col items-center gap-0.5 ${compact ? '' : ''}`}>
      <span className="flex flex-wrap items-center justify-center gap-1.5">
        {typeof oldPrice === 'number' && oldPrice > newPrice && (
          <span className="text-gansid-on-surface/45 line-through decoration-2">
            {currency === 'USD' ? `$${oldPrice}` : formatPrice(oldPrice * 100, currency)}
          </span>
        )}
        <span className="font-display font-bold text-emerald-700">
          {currency === 'USD' ? `$${newPrice}` : formatPrice(newPrice * 100, currency)}
        </span>
        <span className={pillClass} style={pillStyle}>
          {config.label}
        </span>
      </span>
      {config.showCountdown && config.endDate && (
        <span className="text-[10px] text-gansid-on-surface/50">Ends {config.endDate}</span>
      )}
    </span>
  );
}
