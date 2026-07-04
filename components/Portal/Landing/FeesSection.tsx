import { ViscousButton } from '../ui/ViscousButton';
import { PromoPrice } from '../../Pricing/PromoPrice';
import { useLandingContent } from '../content/ContentProvider';
import type { FeesPeriod, FeesRow, FeesTier, PricingPromoConfig } from '../../../types';
import { isPromoActive, shouldShowForCategory } from '../../../utils/pricingPromo';

function scrollToRegister() {
  const targets = document.querySelectorAll<HTMLElement>('[data-register-target]');
  const visible = Array.from(targets).find((t) => t.offsetParent !== null);
  if (visible) {
    visible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

const PERIOD_CELL_COLORS = [
  { stripe: 'bg-emerald-500/10', flat: 'bg-emerald-500/5', text: 'text-emerald-700' },
  { stripe: 'bg-sky-500/10', flat: 'bg-sky-500/5', text: 'text-sky-700' },
  { stripe: 'bg-amber-500/10', flat: 'bg-amber-500/5', text: 'text-amber-700' },
];

const PERIOD_HEADER_COLORS = [
  'rounded-tl-xl bg-emerald-500/15 text-emerald-800',
  'bg-sky-500/15 text-sky-800',
  'rounded-tr-xl bg-amber-500/15 text-amber-800',
];

function cellPrice(
  row: FeesRow,
  period: FeesPeriod,
  promo: PricingPromoConfig,
  stripe: boolean,
  colorIdx: number,
) {
  const raw = row[period.id];
  const price = typeof raw === 'number' ? raw : Number(raw);
  if (Number.isNaN(price)) return '—';

  const colors = PERIOD_CELL_COLORS[colorIdx % PERIOD_CELL_COLORS.length];
  const cellClass = `py-3 md:py-4 px-1 md:px-2 text-center font-display font-bold ${colors.text} ${stripe ? colors.stripe : colors.flat}`;

  const showPromo =
    isPromoActive(promo, new Date())
    && period.id === promo.promoPeriodId
    && shouldShowForCategory(promo, row.category);

  if (showPromo) {
    const compareRaw = row[promo.comparePeriodId];
    const oldPrice = typeof compareRaw === 'number' ? compareRaw : Number(compareRaw);
    return (
      <td key={period.id} className={cellClass}>
        <PromoPrice
          oldPrice={Number.isNaN(oldPrice) ? undefined : oldPrice}
          newPrice={price}
          config={promo}
          compact
        />
      </td>
    );
  }

  return (
    <td key={period.id} className={cellClass}>
      ${price}
    </td>
  );
}

function TierTable({ tier, periods, promo }: { tier: FeesTier; periods: FeesPeriod[]; promo: PricingPromoConfig }) {
  return (
    <div className="space-y-3">
      <div className="w-full rounded-full bg-gansid-gradient-reverse shadow-lg px-4 sm:px-6 md:px-8 py-3 md:py-4 text-center">
        <div className="font-display text-sm sm:text-base md:text-lg uppercase tracking-[0.25em] text-white font-bold">
          {tier.label}
        </div>
        <div className="font-display text-white font-bold text-sm sm:text-base md:text-lg leading-snug">
          {tier.subtitle}
        </div>
      </div>
      <div className="gradient-border rounded-gansid-lg p-1.5 sm:p-2 md:p-4 shadow-lg overflow-hidden">
        <table className="w-full text-sm sm:text-base md:text-lg table-fixed">
          <thead>
            <tr className="font-display">
              <th className="text-left py-3 md:py-4 px-2 md:px-3 text-sm sm:text-base md:text-lg w-[36%]">Category</th>
              {periods.map((period, i) => (
                <th
                  key={period.id}
                  className={`text-center py-2 md:py-3 px-1 md:px-2 ${PERIOD_HEADER_COLORS[i % PERIOD_HEADER_COLORS.length]}`}
                >
                  <div className="text-sm sm:text-base md:text-lg font-bold">{period.label}</div>
                  <div className="text-[10px] sm:text-xs md:text-sm opacity-70 font-normal leading-tight">{period.subtitle}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tier.rows.map((row, i) => {
              const stripe = i % 2 === 0;
              return (
                <tr key={row.category}>
                  <td className={`py-3 md:py-4 px-2 md:px-3 font-display font-bold text-sm sm:text-base md:text-lg text-gansid-on-surface ${stripe ? 'bg-gansid-secondary/5' : ''}`}>{row.category}</td>
                  {periods.map((period, pi) => cellPrice(row, period, promo, stripe, pi))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FeesSection() {
  const { fees, pricingPromo, hero } = useLandingContent();

  return (
    <div className="space-y-6 scroll-mt-8">
      <div className="flex justify-center md:hidden">
        <ViscousButton
          type="button"
          variant="primary"
          className="px-14 text-xl py-4"
          onClick={scrollToRegister}
        >
          {hero.ctaLabel || 'Register Now'}
        </ViscousButton>
      </div>
      <div className="text-center space-y-3">
        <p className="font-display text-base uppercase tracking-[0.25em] text-gansid-secondary font-semibold">
          Pricing
        </p>
        <h2 className="font-display text-4xl md:text-5xl font-bold">
          <span className="bg-gansid-gradient-reverse bg-clip-text text-transparent">
            Conference Fees
          </span>
        </h2>
        <p className="font-body text-lg text-gansid-on-surface/80">{fees.note}</p>
      </div>
      <div className="space-y-8">
        {fees.tiers.map((tier) => (
          <TierTable key={tier.id} tier={tier} periods={fees.periods} promo={pricingPromo} />
        ))}
      </div>
    </div>
  );
}
