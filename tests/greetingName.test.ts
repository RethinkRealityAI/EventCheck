import { describe, expect, it } from 'vitest';
import { greetingName } from '../utils/greetingName';

describe('greetingName', () => {
  it('uses the first name', () => {
    expect(greetingName('Adaeze Okafor')).toBe('Adaeze');
  });

  it('keeps a leading honorific with the first name', () => {
    expect(greetingName('Dr. Adaeze Okafor')).toBe('Dr. Adaeze');
    expect(greetingName('Prof Kunle Adekile')).toBe('Prof Kunle');
    expect(greetingName('mrs. Jane Doe')).toBe('mrs. Jane');
  });

  it('does not strand a lone honorific', () => {
    expect(greetingName('Dr.')).toBe('Dr.');
  });

  it('falls back to the email local part, then a neutral word', () => {
    expect(greetingName('', 'jane.doe@example.com')).toBe('jane.doe');
    expect(greetingName(null, null)).toBe('there');
    expect(greetingName('   ', '')).toBe('there');
  });

  it('collapses extra whitespace', () => {
    expect(greetingName('  Dr.   Mary   Ampomah ')).toBe('Dr. Mary');
  });
});
