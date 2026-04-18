import { describe, it, expect } from 'vitest';
import { SITES } from '../config/sites';

describe('portalEnabled site config', () => {
  it('GANSID has portalEnabled = true', () => {
    expect(SITES.gansid.portalEnabled).toBe(true);
  });

  it('SCAGO has portalEnabled = false', () => {
    expect(SITES.scago.portalEnabled).toBe(false);
  });
});
