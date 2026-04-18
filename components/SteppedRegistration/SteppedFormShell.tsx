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
    <div className="flex flex-col lg:flex-row gap-8 max-w-6xl mx-auto">
      <aside className="lg:w-64 shrink-0">
        <StepperSidebar
          steps={steps}
          currentIndex={currentIndex}
          completedSteps={completedSteps}
          onStepClick={(i) => setCurrentIndex(i)}
        />
      </aside>
      <div className="flex-1">
        <div className="bg-white rounded-lg p-8 shadow">
          <h2 className="text-2xl font-semibold mb-2">{currentStep?.label}</h2>
          {currentStep?.description && <p className="text-slate-600 mb-6">{currentStep.description}</p>}
          <FormRenderer {...props} filteredFields={currentFields} />
          {isLastStep && props.finalStepContent}
          {stepError && <p className="mt-4 text-sm text-red-600">{stepError}</p>}
          <div className="flex justify-between items-center mt-8 pt-6 border-t">
            <button
              type="button"
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-6 py-2 rounded-full border border-slate-300 disabled:opacity-40"
            >
              Previous
            </button>
            {isLastStep ? (
              <button
                type="button"
                onClick={handleSubmitClick}
                className="px-6 py-2 rounded-full bg-red-600 text-white font-semibold"
              >
                Complete Registration
              </button>
            ) : (
              <button
                type="button"
                onClick={handleNext}
                className="px-6 py-2 rounded-full bg-blue-600 text-white font-semibold"
              >
                Next Step →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
