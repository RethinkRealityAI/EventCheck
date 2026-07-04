import { ViscousButton } from '../ui/ViscousButton';
import { useLandingContent } from '../content/ContentProvider';
import type { FeesPeriod, FeesRow, FeesTier } from '../../../types';
import { feesCellPrice, feesCellStrikeoutAmount } from '../../../utils/feesCells';
import { formatPrice } from '../../../utils/pricing';

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

function formatUsd(amount: number) {
  return formatPrice(amount * 100, 'USD');
}

function cellPrice(row: FeesRow, period: FeesPeriod, stripe: boolean, colorIdx: number) {
  const price = feesCellPrice(row[period.id]);
  const strikeout = feesCellStrikeoutAmount(row[period.id]);

  const colors = PERIOD_CELL_COLORS[colorIdx % PERIOD_CELL_COLORS.length];
  const cellClass = `py-3 md:py-4 px-1 md:px-2 text-center font-display font-bold ${colors.text} ${stripe ? colors.stripe : colors.flat}`;

  if (strikeout != null) {
    return (
      <td key={period.id} className={cellClass}>
        <span className="inline-flex flex-col items-center gap-0.5 leading-tight">
          <span className="text-gansid-on-surface/40 line-through decoration-2 text-sm font-semibold">
            {formatUsd(strikeout)}
          </span>
          <span className="text-emerald-700">{formatUsd(price)}</span>
        </span>
      </td>
    );
  }

  return (
    <td key={period.id} className={cellClass}>
      {formatUsd(price)}
    </td>
  );
}

function TierTable({ tier, periods }: { tier: FeesTier; periods: FeesPeriod[] }) {
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
                  {periods.map((period, pi) => cellPrice(row, period, stripe, pi))}
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
  const { fees, hero } = useLandingContent();

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
          <TierTable key={tier.id} tier={tier} periods={fees.periods} />
        ))}
      </div>
    </div>
  );
}
