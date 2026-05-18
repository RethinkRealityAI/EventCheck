import { Plus, X } from 'lucide-react';
import { GlassInput } from '../../Portal/ui/GlassInput';
import {
  type ExtraStaffEntry,
  type StaffCategory,
  EXTRA_STAFF_MAX_PER_ORDER,
  EXTRA_STAFF_UNIT_PRICE_USD,
} from '../validation';

interface Props {
  extras: ExtraStaffEntry[];
  onExtras: (next: ExtraStaffEntry[]) => void;
}

export default function StepExtras({ extras, onExtras }: Props) {
  const atCap = extras.length >= EXTRA_STAFF_MAX_PER_ORDER;
  const subtotalUsd = extras.length * EXTRA_STAFF_UNIT_PRICE_USD;

  const add = () => {
    if (atCap) return;
    onExtras([...extras, { name: '', email: '', category: 'hall_only' }]);
  };
  const update = (i: number, patch: Partial<ExtraStaffEntry>) =>
    onExtras(extras.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const remove = (i: number) => onExtras(extras.filter((_, idx) => idx !== i));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-display">Need more booth staff?</h2>
        <p className="text-sm text-gansid-on-surface/70 font-body mt-0.5">
          Add up to <strong>{EXTRA_STAFF_MAX_PER_ORDER}</strong> additional booth staff beyond your tier
          allotment. Each additional staff is <strong>${EXTRA_STAFF_UNIT_PRICE_USD} USD</strong>, paid online by
          PayPal (or card via PayPal) on the review step.
        </p>
      </div>

      {extras.length === 0 ? (
        <div className="p-4 rounded-gansid-md border border-dashed border-gansid-on-surface/20 bg-white/40 text-center font-body text-sm text-gansid-on-surface/60">
          No additional staff yet. Click below to add one.
        </div>
      ) : (
        <div className="space-y-4">
          {extras.map((e, i) => (
            <div
              key={i}
              className="p-4 rounded-gansid-md border border-gansid-on-surface/10 bg-white/40 space-y-4 relative"
            >
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute top-2 right-2 p-1.5 text-gansid-primary hover:bg-gansid-primary/10 rounded-full transition"
                aria-label="Remove additional staff"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Access selector — moved above name/email and given larger
                  card-style buttons for prominence (most-mistakable choice
                  on this step). */}
              <div>
                <span className="block text-xs font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70 mb-2">
                  Access type
                </span>
                <div className="grid grid-cols-2 gap-2 sm:max-w-md">
                  {(['hall_only', 'full_access'] as const).map((c) => (
                    <label key={c} className="cursor-pointer">
                      <input
                        type="radio"
                        name={`extras-cat-${i}`}
                        value={c}
                        checked={e.category === c}
                        onChange={() => update(i, { category: c as StaffCategory })}
                        className="sr-only peer"
                      />
                      <span className="block text-center px-4 py-2.5 rounded-gansid-md border border-gansid-on-surface/15 bg-white text-sm font-display font-semibold text-gansid-on-surface/70 peer-checked:bg-gansid-primary-gradient peer-checked:text-white peer-checked:border-transparent peer-checked:shadow-md transition-all">
                        {c === 'hall_only' ? 'Hall-Only' : 'Full Congress'}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">
                    Name
                  </span>
                  <GlassInput
                    value={e.name}
                    onChange={(ev) => update(i, { name: ev.target.value })}
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-display font-semibold uppercase tracking-[0.08em] text-gansid-on-surface/70">
                    Email
                  </span>
                  <GlassInput
                    type="email"
                    value={e.email}
                    onChange={(ev) => update(i, { email: ev.target.value })}
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={add}
          disabled={atCap}
          className="inline-flex items-center gap-1 text-sm text-gansid-primary disabled:text-gansid-on-surface/30 font-display font-semibold"
        >
          <Plus className="w-4 h-4" /> Add additional staff
        </button>
        <span className="text-xs text-gansid-on-surface/60 font-body">
          {extras.length}/{EXTRA_STAFF_MAX_PER_ORDER} used
        </span>
      </div>

      {extras.length > 0 && (
        <div className="p-4 rounded-gansid-md bg-gansid-secondary/5 border border-gansid-secondary/20">
          <div className="flex items-center justify-between">
            <span className="font-body text-sm text-gansid-on-surface/80">
              {extras.length} × ${EXTRA_STAFF_UNIT_PRICE_USD} USD
            </span>
            <span className="font-display font-bold text-lg text-gansid-on-surface">
              ${subtotalUsd}.00 USD
            </span>
          </div>
          <p className="mt-2 text-xs text-gansid-on-surface/70 font-body">
            A PayPal button will appear on the review step to complete this purchase.
          </p>
        </div>
      )}
    </section>
  );
}
