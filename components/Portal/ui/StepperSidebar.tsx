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
      className="flex flex-row lg:flex-col gap-0 lg:gap-0 py-2 lg:py-4 w-full lg:h-full lg:justify-between lg:min-h-[520px]"
      aria-label="Registration steps"
    >
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isComplete = completedSteps.has(i);
        const isReachable = isComplete || i <= currentIndex;
        const isLast = i === steps.length - 1;
        return (
          <div
            key={step.id}
            className="relative flex flex-1 lg:flex-initial flex-col lg:flex-row items-center lg:items-start gap-1.5 lg:gap-4 min-w-0"
          >
            <button
              type="button"
              onClick={() => isReachable && onStepClick?.(i)}
              disabled={!isReachable}
              className={[
                'relative z-10 shrink-0 h-9 w-9 lg:h-14 lg:w-14 rounded-full flex items-center justify-center font-display font-bold text-sm lg:text-xl transition-all duration-300 ease-viscous',
                isCurrent
                  ? 'bg-gansid-primary-gradient text-white shadow-lg ring-4 ring-gansid-primary/15'
                  : isComplete
                  ? 'bg-gansid-primary-container text-white shadow-md'
                  : 'bg-gansid-surface-container-low text-gansid-on-surface/40',
              ].join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isComplete ? '✓' : i + 1}
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
                  'font-display font-semibold leading-tight text-[10px] lg:text-[17px] lg:leading-tight max-w-full px-0.5 lg:px-0',
                  isCurrent ? 'text-gansid-on-surface' : 'text-gansid-on-surface/50',
                ].join(' ')}
              >
                {step.label}
              </span>
              {step.description && isCurrent && (
                <span className="hidden lg:block text-sm text-gansid-on-surface/70 mt-1">{step.description}</span>
              )}
            </div>
            {!isLast && (
              <>
                {/* Desktop: vertical connector — fills the gap between this step and the next,
                    since the outer nav uses justify-between for even distribution. */}
                <span
                  className="hidden lg:block absolute left-[27px] top-16 bottom-[-1rem] w-[2px] rounded-full"
                  style={{
                    background: isComplete || isCurrent
                      ? 'linear-gradient(to bottom, #E0243C, #2260a1)'
                      : 'rgba(26, 28, 28, 0.12)',
                  }}
                />
                {/* Mobile: horizontal connector from right edge of this circle to left edge of next */}
                <span
                  className="lg:hidden absolute top-[17px] h-[2px] rounded-full"
                  style={{
                    left: 'calc(50% + 18px)',
                    right: 'calc(-50% + 18px)',
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
