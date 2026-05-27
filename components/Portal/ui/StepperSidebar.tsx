import { Check } from 'lucide-react';
import type { FormStep } from '../../../types';

interface StepperSidebarProps {
  steps: FormStep[];
  currentIndex: number;
  completedSteps: Set<number>;
  onStepClick?: (index: number) => void;
}

export function StepperSidebar({ steps, currentIndex, completedSteps, onStepClick }: StepperSidebarProps) {
  return (
    <nav
      // `lg:h-full` + the parent aside's `lg:h-screen` give the nav a fixed
      // vertical size so the `flex-1` children can divide it equally. The
      // min-height protects us on short viewports or when the parent sticky
      // layout doesn't resolve a pixel height in time.
      className="flex flex-row lg:flex-col gap-0 py-2 lg:py-8 w-full lg:h-full lg:min-h-[600px]"
      aria-label="Registration steps"
    >
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isComplete = completedSteps.has(i);
        const isReachable = isComplete || i <= currentIndex;
        const isLast = i === steps.length - 1;
        return (
          // `flex-1` makes every step slot take an equal share of the sidebar
          // (horizontal at mobile, vertical at desktop). Paired with the
          // connector's `top: 3.5rem / bottom: 0` below, the gradient line
          // bridges cleanly between adjacent circles without gaps or truncation.
          <div
            key={step.id}
            className="relative flex flex-1 flex-col lg:flex-row items-center lg:items-start gap-1.5 lg:gap-4 min-w-0"
          >
            <button
              type="button"
              onClick={() => isReachable && onStepClick?.(i)}
              disabled={!isReachable}
              className={[
                'relative z-10 shrink-0 h-10 w-10 lg:h-14 lg:w-14 rounded-full flex items-center justify-center font-display font-bold text-sm lg:text-lg transition-all duration-300 ease-viscous border-2',
                isCurrent
                  ? 'border-transparent bg-gansid-primary-gradient text-white shadow-lg ring-4 ring-gansid-primary/20 scale-105'
                  : isComplete
                  ? 'border-transparent bg-gansid-primary-gradient text-white shadow-md'
                  : 'border-gansid-outline-variant/35 bg-white text-gansid-on-surface/35',
              ].join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isComplete ? <Check className="h-5 w-5 lg:h-7 lg:w-7 stroke-[2.5]" aria-hidden /> : i + 1}
            </button>
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left min-w-0 max-w-full lg:pt-2 lg:pb-1">
              <span
                className={[
                  'hidden lg:block text-[11px] uppercase tracking-[0.1em] font-display font-semibold',
                  isCurrent ? 'text-gansid-primary' : 'text-gansid-on-surface/40',
                ].join(' ')}
              >
                STEP {i + 1}
              </span>
              <span
                className={[
                  'font-display font-semibold leading-tight text-[10px] lg:text-[15px] lg:leading-tight max-w-full px-0.5 lg:px-0 line-clamp-2',
                  isCurrent ? 'text-gansid-on-surface' : 'text-gansid-on-surface/50',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <>
                {/* Desktop: vertical connector. Circle h-14 (56px) is centered
                    horizontally at x=28 (circle left:0 + w-14/2). Line sits at
                    left:27 to stay centered (w-[2px]).
                    top:3.5rem (= 56px) places the line just below the circle.
                    bottom:0 reaches the bottom of THIS flex-1 slot, which is
                    exactly the top of the NEXT circle — so the gradient line
                    bridges the gap continuously. */}
                <span
                  className="hidden lg:block absolute left-[27px] top-[3.5rem] bottom-0 w-[3px] rounded-full"
                  style={{
                    background: isComplete || isCurrent
                      ? 'linear-gradient(to bottom, #E0243C, #2260a1)'
                      : 'rgba(26, 28, 28, 0.12)',
                  }}
                />
                {/* Mobile: horizontal connector from right edge of this circle
                    to left edge of next. */}
                <span
                  className="lg:hidden absolute top-[19px] h-[2px] rounded-full"
                  style={{
                    left: 'calc(50% + 20px)',
                    right: 'calc(-50% + 20px)',
                    background: isComplete || isCurrent
                      ? 'linear-gradient(to right, #E0243C, #2260a1)'
                      : 'rgba(26, 28, 28, 0.12)',
                  }}
                />
              </>
            )}
          </div>
        );
      })}
    </nav>
  );
}
