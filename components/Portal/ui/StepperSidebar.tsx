import type { FormStep } from '../../../types';

interface StepperSidebarProps {
  steps: FormStep[];
  currentIndex: number;
  completedSteps: Set<number>;
  onStepClick?: (index: number) => void;
}

export function StepperSidebar({ steps, currentIndex, completedSteps, onStepClick }: StepperSidebarProps) {
  return (
    <nav className="flex flex-col gap-6 py-4" aria-label="Registration steps">
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
                'shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-display transition-all duration-300 ease-viscous',
                isCurrent
                  ? 'bg-gansid-secondary text-white shadow-invisible-lift'
                  : isComplete
                  ? 'bg-gansid-primary-container text-white'
                  : 'bg-gansid-surface-container-low text-gansid-on-surface/40',
              ].join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {isComplete ? '✓' : i + 1}
            </button>
            <div className="flex flex-col pt-1">
              <span
                className={[
                  'text-xs uppercase tracking-wide',
                  isCurrent ? 'text-gansid-secondary' : 'text-gansid-on-surface/40',
                ].join(' ')}
              >
                STEP {i + 1}
              </span>
              <span
                className={[
                  'font-display font-semibold',
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
                className="absolute left-5 top-12 w-px h-12"
                style={{
                  background: isComplete || isCurrent
                    ? 'linear-gradient(to bottom, #2260a1, rgba(34, 96, 161, 0.2))'
                    : 'rgba(26, 28, 28, 0.15)',
                }}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}
