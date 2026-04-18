import { useState, useMemo, useEffect, type ReactNode } from 'react';
import { FormRenderer, type FormRendererProps } from './FormRenderer';
import { StepperSidebar } from '../Portal/ui/StepperSidebar';
import { groupFieldsBySection, validateRequired, validateRms, validateGroupMembers, type GroupMember } from './steppedValidation';

interface SteppedFormShellProps extends Omit<FormRendererProps, 'filteredFields'> {
  onSubmit: () => void | Promise<void>;
  finalStepContent?: ReactNode;
  userId?: string | null;                                       // stable cache key
  onRestoreAnswers?: (answers: Record<string, any>) => void;   // called when localStorage restores
}

export function SteppedFormShell(props: SteppedFormShellProps) {
  const steps = props.form.settings?.steps ?? [];
  const fieldsByStep = useMemo(
    () => groupFieldsBySection(props.form.fields, steps),
    [props.form.fields, steps],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [stepError, setStepError] = useState('');

  const userId = props.userId ?? 'anon';
  const storageKey = `gansid-portal-stepper:${props.form.id}:${userId}`;

  // Restore progress from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed.answers && typeof parsed.answers === 'object') {
        props.onRestoreAnswers?.(parsed.answers);
      }
      if (typeof parsed.currentIndex === 'number') {
        setCurrentIndex(parsed.currentIndex);
      }
      if (parsed.registrationMode === 'individual' || parsed.registrationMode === 'group') {
        props.setRegistrationMode(parsed.registrationMode);
      }
      if (typeof parsed.groupSize === 'number') {
        props.setGroupSize(parsed.groupSize);
      }
      if (typeof parsed.groupHasAllInfo === 'boolean') {
        props.setGroupHasAllInfo(parsed.groupHasAllInfo);
      }
      if (Array.isArray(parsed.groupMembers)) {
        props.setGroupMembers(parsed.groupMembers);
      }
    } catch {
      /* ignore malformed localStorage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist answers + currentIndex + RMS group state whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          answers: props.answers,
          currentIndex,
          registrationMode: props.registrationMode,
          groupSize: props.groupSize,
          groupHasAllInfo: props.groupHasAllInfo,
          groupMembers: props.groupMembers,
        }),
      );
    } catch {
      /* ignore quota errors */
    }
  }, [props.answers, currentIndex, props.registrationMode, props.groupSize, props.groupHasAllInfo, props.groupMembers, storageKey]);

  const clearPersistence = () => {
    try { localStorage.removeItem(storageKey); } catch {}
  };

  const currentStep = steps[currentIndex];
  const currentFields = currentStep ? fieldsByStep[currentStep.id] ?? [] : [];
  const isLastStep = currentIndex === steps.length - 1;

  const validateCurrentStep = (): boolean => {
    const req = validateRequired(currentFields, props.answers, props.isVisible);
    if (!req.ok) { setStepError(req.error!); return false; }

    const rmsField = currentFields.find(f => f.type === 'registration-mode-selector') ?? null;
    if (rmsField) {
      const rms = validateRms(rmsField, props.registrationMode);
      if (!rms.ok) { setStepError(rms.error!); return false; }

      const groupMembers = (props.groupMembers ?? []) as GroupMember[];
      const grp = validateGroupMembers(props.registrationMode, groupMembers, Boolean(props.pricingTemplate));
      if (!grp.ok) { setStepError(grp.error!); return false; }
    }

    setStepError('');
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setCompletedSteps(prev => new Set(prev).add(currentIndex));
    setCurrentIndex(i => Math.min(i + 1, steps.length - 1));
  };

  const handlePrevious = () => {
    setStepError('');
    setCurrentIndex(i => Math.max(i - 1, 0));
  };

  const handleSubmitClick = async () => {
    if (!validateCurrentStep()) return;
    setCompletedSteps(prev => new Set(prev).add(currentIndex));
    await props.onSubmit();
    clearPersistence();
  };

  if (steps.length === 0) {
    // Misconfigured stepped form — fall back to rendering all fields at once
    return <FormRenderer {...props} filteredFields={props.form.fields} />;
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Scrollable body: stepper sidebar (sticky on desktop) + step content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10 px-6 md:px-8 pt-6 md:pt-8 pb-4">
          <aside className="lg:w-60 shrink-0 lg:sticky lg:top-0 lg:self-start">
            <StepperSidebar
              steps={steps}
              currentIndex={currentIndex}
              completedSteps={completedSteps}
              onStepClick={(i) => setCurrentIndex(i)}
            />
          </aside>
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl md:text-3xl font-semibold mb-1 font-display">{currentStep?.label}</h2>
            {currentStep?.description && <p className="text-gansid-on-surface/60 mb-5 font-body">{currentStep.description}</p>}
            {/* 2-column grid on desktop — FormRenderer wraps each field in a div,
                short inputs (text/email/phone/number) naturally share rows, long
                fields (textarea, radio groups, ticket) stretch full-width via
                sm:col-span-2 applied within FormRenderer. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormRenderer {...props} filteredFields={currentFields} />
              {isLastStep && <div className="sm:col-span-2">{props.finalStepContent}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed footer: always visible at the bottom of the modal card */}
      <div className="shrink-0 border-t border-gansid-outline-variant/20 bg-gansid-surface-container-lowest px-6 md:px-8 py-4 flex flex-col gap-3">
        {stepError && <p className="text-sm text-gansid-primary font-semibold">{stepError}</p>}
        <div className="flex justify-between items-center gap-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="px-6 py-2.5 rounded-full bg-white border border-gansid-outline-variant/40 text-gansid-on-surface font-display font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gansid-surface-container-low transition"
          >
            ← Previous
          </button>
          <div className="flex items-center gap-2 text-xs font-display text-gansid-on-surface/50 uppercase tracking-wider">
            Step {currentIndex + 1} of {steps.length}
          </div>
          {isLastStep ? (
            <button
              type="button"
              onClick={handleSubmitClick}
              className="px-8 py-2.5 rounded-full bg-gansid-primary-gradient text-white font-display font-bold shadow-lg hover:scale-[1.02] transition-all whitespace-nowrap"
            >
              Complete Registration
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="px-8 py-2.5 rounded-full bg-gansid-primary-gradient text-white font-display font-bold shadow-lg hover:scale-[1.02] transition-all whitespace-nowrap"
            >
              Next Step →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
