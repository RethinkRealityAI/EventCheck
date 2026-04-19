import type { FormStep } from '../../../types';

interface StepperSidebarProps {
  steps: FormStep[];
  currentIndex: number;
  completedSteps: Set<number>;
  onStepClick?: (index: number) => void;
}

export function StepperSidebar({ steps, currentIndex, completedSteps, onStepClick }: StepperSidebarProps) {
  return (
    <nav className="flex flex-col gap-10 py-6" aria-label="Registration steps">
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isComplete = completedSteps.has(i);
        const isReachable = isComplete || i <= currentIndex;
        return (
          <div key={step.id} className="relative flex items-start gap-4">
            <button
              type="button"
              onClick={() => isReachable && onStepClick?.(i)}
              disabled={!isReachable}
              className={[
                'shrink-0 h-12 w-12 rounded-full flex items-center justify-center font-display font-bold text-lg transition-all duration-300 ease-viscous',
                isCurrent
                  ? 'bg-gansid-primary-gradient text-white shadow-lg ring-2 ring-gansid-primary/20'
                  : isComplete
                  ? 'bg-gansid-primary-container text-white shadow-md'
                  : 'bg-gansid-surface-container-low text-gansid-on-surface/40',
              ].join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isComplete ? '✓' : i + 1}
            </button>
            <div className="flex flex-col pt-1.5">
              <span
                className={[
                  'text-xs uppercase tracking-wide font-display font-semibold',
                  isCurrent ? 'text-gansid-primary' : 'text-gansid-on-surface/40',
                ].join(' ')}
              >
                STEP {i + 1}
              </span>
              <span
                className={[
                  'font-display font-semibold text-base',
                  isCurrent ? 'text-gansid-on-surface' : 'text-gansid-on-surface/50',
                ].join(' ')}
              >
                {step.label}
              </span>
              {step.description && isCurrent && (
                <span className="text-sm text-gansid-on-surface/70 mt-1">{step.description}</span>
              )}
            </div>
            {i < steps.length - 1 && (
              <span
                className="absolute left-[23px] top-14 w-[2px] h-16 rounded-full"
                style={{
                  background: isComplete || isCurrent
                    ? 'linear-gradient(to bottom, #E0243C, #2260a1)'
                    : 'rgba(26, 28, 28, 0.12)',
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
