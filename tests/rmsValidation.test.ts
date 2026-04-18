import { describe, it, expect } from 'vitest';
import type { FormField } from '../types';
import { validateRequired, validateRms } from '../components/SteppedRegistration/steppedValidation';

describe('RMS field validation', () => {
  it('does NOT require answers[rmsField.id] since its value lives in registrationMode state', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector' as any,
      label: 'Registration Type',
      required: true,
    } as any;
    const answers: Record<string, any> = {};
    const result = validateRequired([rmsField], answers, () => true);
    expect(result.ok).toBe(true);
  });

  it('reports missing RMS selection via validateRms when registrationMode is null', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector' as any,
      label: 'Registration Type',
      required: true,
    } as any;
    const result = validateRms(rmsField, null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Registration Type');
  });

  it('passes validateRms when registrationMode is set', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector' as any,
      label: 'Registration Type',
      required: true,
    } as any;
    expect(validateRms(rmsField, 'individual').ok).toBe(true);
    expect(validateRms(rmsField, 'group').ok).toBe(true);
  });
});
