import { describe, expect, it } from 'vitest';
import { attendeeTitleOf, nameWithTitle } from '../utils/attendeeTitle';

describe('attendeeTitleOf', () => {
  it('reads the seeded f_title answer', () => {
    expect(attendeeTitleOf({ answers: { f_title: 'Dr. ' } })).toBe('Dr.');
  });

  it('finds a template-built Title field by its label on the form', () => {
    const form = { fields: [{ id: 'f_123_title', label: 'Title' }] };
    expect(attendeeTitleOf({ answers: { f_123_title: 'Prof.' } }, form)).toBe('Prof.');
  });

  it('is empty when unanswered or not a string', () => {
    expect(attendeeTitleOf({ answers: null })).toBe('');
    expect(attendeeTitleOf({ answers: { f_title: ['Dr.'] } })).toBe('');
  });
});

describe('nameWithTitle', () => {
  it('puts the title in front of the name', () => {
    expect(nameWithTitle('Jane Doe', 'Dr.')).toBe('Dr. Jane Doe');
  });

  it('leaves the name alone without a title', () => {
    expect(nameWithTitle('Jane Doe', '')).toBe('Jane Doe');
  });

  it('does not double a title already typed into the name', () => {
    expect(nameWithTitle('Dr Jane Doe', 'Dr.')).toBe('Dr Jane Doe');
    expect(nameWithTitle('dr. Jane Doe', 'Dr.')).toBe('dr. Jane Doe');
  });

  it('does not mistake a first name that starts with the title letters', () => {
    expect(nameWithTitle('Drew Barry', 'Dr.')).toBe('Dr. Drew Barry');
    expect(nameWithTitle('Msimang Tau', 'Ms.')).toBe('Ms. Msimang Tau');
  });
});
