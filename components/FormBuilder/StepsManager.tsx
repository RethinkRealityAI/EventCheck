import React from 'react';
import type { FormStep } from '../../types';

interface StepsManagerProps {
  renderMode: 'single' | 'stepped' | undefined;
  steps: FormStep[];
  onRenderModeChange: (mode: 'single' | 'stepped') => void;
  onStepsChange: (steps: FormStep[]) => void;
}

export function StepsManager({ renderMode, steps, onRenderModeChange, onStepsChange }: StepsManagerProps) {
  const addStep = () => {
    onStepsChange([...steps, { id: `step-${Date.now()}`, label: 'New Step' }]);
  };
  const updateStep = (i: number, patch: Partial<FormStep>) => {
    onStepsChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };
  const removeStep = (i: number) => {
    onStepsChange(steps.filter((_, idx) => idx !== i));
  };
  const moveStep = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    onStepsChange(next);
  };

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={renderMode === 'stepped'}
          onChange={(e) => onRenderModeChange(e.target.checked ? 'stepped' : 'single')}
        />
        <span>Render as multi-step form</span>
      </label>
      {renderMode === 'stepped' && (
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <h4 className="font-semibold">Steps</h4>
            <button type="button" onClick={addStep} className="text-sm text-blue-600">+ Add step</button>
          </div>
          {steps.map((step, i) => (
            <div key={step.id} className="border rounded p-2 flex items-start gap-2">
              <div className="flex flex-col">
                <button type="button" onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-xs disabled:opacity-40">↑</button>
                <button type="button" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-xs disabled:opacity-40">↓</button>
              </div>
              <div className="flex-1 space-y-1">
                <input
                  className="w-full border rounded px-2 py-1 text-sm"
                  value={step.label}
                  onChange={(e) => updateStep(i, { label: e.target.value })}
                  placeholder="Step label"
                />
                <input
                  className="w-full border rounded px-2 py-1 text-xs"
                  value={step.description ?? ''}
                  onChange={(e) => updateStep(i, { description: e.target.value })}
                  placeholder="Description (optional)"
                />
                <div className="text-xs text-slate-500">id: {step.id}</div>
              </div>
              <button type="button" onClick={() => removeStep(i)} className="text-red-600 text-sm">Remove</button>
            </div>
          ))}
          {steps.length === 0 && <p className="text-sm text-slate-500">No steps yet. Add your first step.</p>}
        </div>
      )}
    </div>
  );
}
