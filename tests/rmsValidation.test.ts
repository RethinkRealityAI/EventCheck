import { describe, it, expect } from 'vitest';
import type { FormField } from '../types';
import { validateRequired, validateRms, validateGroupMembers, groupFieldsBySection } from '../components/SteppedRegistration/steppedValidation';
import type { GroupMember } from '../components/SteppedRegistration/steppedValidation';

describe('RMS field validation', () => {
  it('does NOT require answers[rmsField.id] since its value lives in registrationMode state', () => {
    const rmsField: FormField = {
      id: 'mode-select',
      type: 'registration-mode-selector',
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
      type: 'registration-mode-selector',
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
      type: 'registration-mode-selector',
      label: 'Registration Type',
      required: true,
    } as any;
    expect(validateRms(rmsField, 'individual').ok).toBe(true);
    expect(validateRms(rmsField, 'group').ok).toBe(true);
  });
});

describe('validateGroupMembers', () => {
  const validMember: GroupMember = { name: 'Alice Smith', email: 'alice@example.com', countryCode: 'CA', categoryId: 'cat-1' };

  it('returns ok when registrationMode is individual', () => {
    const result = validateGroupMembers('individual', [], false);
    expect(result.ok).toBe(true);
  });

  it('returns ok when registrationMode is null', () => {
    const result = validateGroupMembers(null, [], false);
    expect(result.ok).toBe(true);
  });

  it('returns error when members array is empty', () => {
    const result = validateGroupMembers('group', [], false);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Please add at least one additional registrant.');
  });

  it('returns error when a member has empty name', () => {
    const members: GroupMember[] = [{ name: '   ', email: 'alice@example.com' }];
    const result = validateGroupMembers('group', members, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('name');
  });

  it('returns error when a member has whitespace-only name', () => {
    const members: GroupMember[] = [{ name: '\t', email: 'alice@example.com' }];
    const result = validateGroupMembers('group', members, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('name');
  });

  it('returns error when a member has valid name but empty email', () => {
    const members: GroupMember[] = [{ name: 'Alice Smith', email: '' }];
    const result = validateGroupMembers('group', members, false);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('email');
  });

  it('returns country error when requireCountryAndCategory is true and countryCode is missing', () => {
    const members: GroupMember[] = [{ name: 'Alice Smith', email: 'alice@example.com', countryCode: null, categoryId: 'cat-1' }];
    const result = validateGroupMembers('group', members, true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('country');
  });

  it('returns category error when requireCountryAndCategory is true and categoryId is missing', () => {
    const members: GroupMember[] = [{ name: 'Alice Smith', email: 'alice@example.com', countryCode: 'CA', categoryId: null }];
    const result = validateGroupMembers('group', members, true);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('category');
  });

  it('returns ok when requireCountryAndCategory is false and country/category are absent', () => {
    const members: GroupMember[] = [{ name: 'Alice Smith', email: 'alice@example.com' }];
    const result = validateGroupMembers('group', members, false);
    expect(result.ok).toBe(true);
  });

  it('returns ok when all members are fully valid with requireCountryAndCategory true', () => {
    const members: GroupMember[] = [validMember, { name: 'Bob Jones', email: 'bob@example.com', countryCode: 'US', categoryId: 'cat-2' }];
    const result = validateGroupMembers('group', members, true);
    expect(result.ok).toBe(true);
  });
});

describe('groupFieldsBySection', () => {
  it('groups fields by their section ID, sorted by sectionOrder', () => {
    const steps = [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ];
    const fields = [
      { id: 'f1', section: 'a', sectionOrder: 1, label: 'F1', type: 'text', required: false },
      { id: 'f2', section: 'b', sectionOrder: 1, label: 'F2', type: 'text', required: false },
      { id: 'f3', section: 'a', sectionOrder: 2, label: 'F3', type: 'text', required: false },
    ] as any[];
    const result = groupFieldsBySection(fields, steps);
    expect(result.a.map(f => f.id)).toEqual(['f1', 'f3']);
    expect(result.b.map(f => f.id)).toEqual(['f2']);
  });

  it('falls back to first step for fields with no section', () => {
    const steps = [{ id: 'first', label: 'First' }];
    const fields = [{ id: 'f1', label: 'F1', type: 'text', required: false }] as any[];
    expect(groupFieldsBySection(fields, steps).first).toHaveLength(1);
  });

  it('returns empty-arrayed object when no steps provided', () => {
    expect(groupFieldsBySection([], [])).toEqual({});
  });

  it('places unknown-section fields into the first step', () => {
    const steps = [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }];
    const fields = [{ id: 'orphan', section: 'nonexistent', label: 'O', type: 'text', required: false }] as any[];
    const result = groupFieldsBySection(fields, steps);
    expect(result.one).toHaveLength(1);
    expect(result.two).toHaveLength(0);
  });
});
