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

  // --- hasAllInfo (inline group mode) — required field enforcement on each
  // member's fullAnswers against the form's field list ---
  describe('with hasAllInfo inline-mode', () => {
    const requiredText: FormField = {
      id: 'f_dietary', type: 'text', label: 'Dietary restrictions', required: true,
    } as any;
    const consentBool: FormField = {
      id: 'f_terms', type: 'boolean', label: 'I agree to the T&C', required: true,
      consentModal: { title: 'T&C', url: '/tc.md' }, linkText: 'T&C',
    } as any;
    const optionalText: FormField = {
      id: 'f_note', type: 'text', label: 'Note', required: false,
    } as any;
    // A conditional field: only required when f_medical === 'yes'
    const conditionalText: FormField = {
      id: 'f_emerg', type: 'text', label: 'Emergency contact', required: true,
      conditional: { enabled: true, fieldId: 'f_medical', value: 'yes' },
    } as any;
    const medicalField: FormField = {
      id: 'f_medical', type: 'radio', label: 'Medical?', required: false, options: ['yes', 'no'],
    } as any;

    it('fails when required text missing on a guest', () => {
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: { f_terms: true /* missing f_dietary */ } },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [requiredText, consentBool],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Dietary restrictions');
      expect(result.error).toContain('additional registrant 1');
    });

    it('fails when required consent boolean is false', () => {
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: { f_dietary: 'Vegan', f_terms: false } },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [requiredText, consentBool],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('T&C');
    });

    it('passes when required consent boolean is true', () => {
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: { f_dietary: 'Vegan', f_terms: true } },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [requiredText, consentBool],
      });
      expect(result.ok).toBe(true);
    });

    it('skips conditional fields that are not visible for this guest', () => {
      // f_emerg is required only when f_medical=yes; this guest said no → skip
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: { f_medical: 'no' /* no f_emerg */ } },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [medicalField, conditionalText],
      });
      expect(result.ok).toBe(true);
    });

    it('enforces conditional fields that ARE visible for this guest', () => {
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: { f_medical: 'yes' /* no f_emerg */ } },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [medicalField, conditionalText],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('Emergency contact');
    });

    it('ignores optional fields regardless of value', () => {
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: {} },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [optionalText],
      });
      expect(result.ok).toBe(true);
    });

    it('names the correct guest index in error messages', () => {
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: { f_dietary: 'Vegan', f_terms: true } }, // complete
        { name: 'Bob', email: 'b@x.com', fullAnswers: { f_terms: true /* missing f_dietary */ } }, // incomplete
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [requiredText, consentBool],
      });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('additional registrant 2');
    });

    it('skips identity fields (f_fname/_lname/_email/_country suffixes)', () => {
      // Required identity-suffix fields should be skipped by the inline
      // validator since they're captured at the top of each row.
      const nameField: FormField = {
        id: 'f_custom_fname', type: 'text', label: 'First name', required: true,
      } as any;
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: {} },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [nameField],
      });
      expect(result.ok).toBe(true);
    });

    it('skips non-answer field types (ticket, rms, country)', () => {
      const ticketField: FormField = {
        id: 'tkt', type: 'ticket', label: 'Ticket', required: true,
      } as any;
      const countryField: FormField = {
        id: 'f_country', type: 'country', label: 'Country', required: true,
      } as any;
      const rmsField: FormField = {
        id: 'rms', type: 'registration-mode-selector', label: 'Mode', required: true,
      } as any;
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: {} },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: true,
        formFields: [ticketField, countryField, rmsField],
      });
      expect(result.ok).toBe(true);
    });

    it('does NOT validate fullAnswers when hasAllInfo is false', () => {
      // Send-links mode: the purchaser hasn't filled the inline details,
      // so the required-field check should be skipped entirely.
      const members: GroupMember[] = [
        { name: 'Alice', email: 'a@x.com', fullAnswers: {} },
      ];
      const result = validateGroupMembers('group', members, false, {
        hasAllInfo: false,
        formFields: [requiredText, consentBool],
      });
      expect(result.ok).toBe(true);
    });
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
