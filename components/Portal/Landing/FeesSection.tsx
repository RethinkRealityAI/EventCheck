import { ViscousButton } from '../ui/ViscousButton';
import { FEES } from './content';

function scrollToRegister() {
  const targets = document.querySelectorAll<HTMLElement>('[data-register-target]');
  const visible = Array.from(targets).find((t) => t.offsetParent !== null);
  if (visible) {
    visible.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

type Tier = (typeof FEES.tiers)[number];

function TierTable({ tier }: { tier: Tier }) {
  return (
    <div className="space-y-3">
      <div className="w-full rounded-full bg-gansid-gradient-reverse shadow-lg px-4 sm:px-6 md:px-8 py-3 md:py-4 text-center">
        <div className="font-display text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/80 font-semibold">
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
              <th className="text-center py-2 md:py-3 px-1 md:px-2 rounded-tl-xl bg-emerald-500/15 text-emerald-800">
                <div className="text-sm sm:text-base md:text-lg font-bold">{FEES.periods[0].label}</div>
                <div className="text-[10px] sm:text-xs md:text-sm text-emerald-800/70 font-normal leading-tight">{FEES.periods[0].subtitle}</div>
              </th>
              <th className="text-center py-2 md:py-3 px-1 md:px-2 bg-sky-500/15 text-sky-800">
                <div className="text-sm sm:text-base md:text-lg font-bold">{FEES.periods[1].label}</div>
                <div className="text-[10px] sm:text-xs md:text-sm text-sky-800/70 font-normal leading-tight">{FEES.periods[1].subtitle}</div>
              </th>
              <th className="text-center py-2 md:py-3 px-1 md:px-2 rounded-tr-xl bg-amber-500/15 text-amber-800">
                <div className="text-sm sm:text-base md:text-lg font-bold">{FEES.periods[2].label}</div>
                <div className="text-[10px] sm:text-xs md:text-sm text-amber-800/70 font-normal leading-tight">{FEES.periods[2].subtitle}</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {tier.rows.map((row, i) => {
              const stripe = i % 2 === 0;
              return (
                <tr key={row.category}>
                  <td className={`py-3 md:py-4 px-2 md:px-3 font-display font-bold text-sm sm:text-base md:text-lg text-gansid-on-surface ${stripe ? 'bg-gansid-secondary/5' : ''}`}>{row.category}</td>
                  <td className={`py-3 md:py-4 px-1 md:px-2 text-center font-display font-bold text-emerald-700 ${stripe ? 'bg-emerald-500/10' : 'bg-emerald-500/5'}`}>${row.early}</td>
                  <td className={`py-3 md:py-4 px-1 md:px-2 text-center font-display font-bold text-sky-700 ${stripe ? 'bg-sky-500/10' : 'bg-sky-500/5'}`}>${row.regular}</td>
                  <td className={`py-3 md:py-4 px-1 md:px-2 text-center font-display font-bold text-amber-700 ${stripe ? 'bg-amber-500/10' : 'bg-amber-500/5'}`}>${row.onsite}</td>
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
  return (
    <div className="space-y-6 scroll-mt-8">
      <div className="flex justify-center">
        <ViscousButton
          type="button"
          variant="primary"
          className="px-14 text-xl py-4"
          onClick={scrollToRegister}
        >
          Register Now
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
        <p className="font-body text-lg text-gansid-on-surface/80">{FEES.note}</p>
      </div>
      <div className="space-y-8">
        {FEES.tiers.map((tier) => (
          <TierTable key={tier.id} tier={tier} />
        ))}
      </div>
    </div>
  );
}
