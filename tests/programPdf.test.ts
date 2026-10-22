import { describe, expect, it } from 'vitest';
import { buildProgramPdf, generatedStamp, pdfSafe } from '../utils/programPdf';

describe('programme PDF', () => {
  it('spells out characters Helvetica cannot print', () => {
    expect(pdfSafe('Sickle β-Thalassemia and α-Thalassaemia – Hi-PCR® ™')).toBe(
      'Sickle beta-Thalassemia and alpha-Thalassaemia – Hi-PCR® ™',
    );
  });

  it('stamps the generation time in IST', () => {
    expect(generatedStamp(new Date('2026-10-22T17:15:00Z'))).toBe('Thursday, 22 Oct 2026, 22:45 IST');
  });

  it('builds from the live programme, abstracts included', () => {
    const doc = buildProgramPdf({ now: new Date('2026-10-22T17:15:00Z') });
    expect(doc.getNumberOfPages()).toBeGreaterThan(3);
    const raw = doc.output();
    expect(raw).toContain('Official Opening & Welcome Ceremony');
    expect(raw).toContain('Dr. Kalpita Gawit');
    expect(raw).toContain('Latest version, generated Thursday, 22 Oct 2026, 22:45 IST');
  });
});
