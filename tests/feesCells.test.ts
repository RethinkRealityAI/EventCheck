import { describe, it, expect } from 'vitest';
import {
  feesCellPrice,
  feesCellStrikeoutAmount,
  parseFeesCell,
  serializeFeesCell,
} from '../utils/feesCells';

describe('parseFeesCell', () => {
  it('reads legacy bare numbers', () => {
    expect(parseFeesCell(175)).toEqual({
      price: 175,
      strikeout: null,
      strikeoutEnabled: false,
    });
  });
  it('reads rich cells', () => {
    expect(parseFeesCell({ price: 175, strikeout: 200, strikeoutEnabled: true })).toEqual({
      price: 175,
      strikeout: 200,
      strikeoutEnabled: true,
    });
  });
});

describe('feesCellStrikeoutAmount', () => {
  it('returns amount only when enabled and higher than price', () => {
    expect(feesCellStrikeoutAmount({ price: 175, strikeout: 200, strikeoutEnabled: true })).toBe(200);
    expect(feesCellStrikeoutAmount({ price: 175, strikeout: 200, strikeoutEnabled: false })).toBeNull();
    expect(feesCellStrikeoutAmount({ price: 200, strikeout: 175, strikeoutEnabled: true })).toBeNull();
    expect(feesCellStrikeoutAmount(175)).toBeNull();
  });
});

describe('serializeFeesCell', () => {
  it('stores bare number when strikeout is off', () => {
    expect(serializeFeesCell({ price: 175, strikeout: 200, strikeoutEnabled: false })).toBe(175);
  });
  it('stores object when strikeout is on', () => {
    expect(serializeFeesCell({ price: 175, strikeout: 200, strikeoutEnabled: true })).toEqual({
      price: 175,
      strikeout: 200,
      strikeoutEnabled: true,
    });
  });
});

describe('feesCellPrice', () => {
  it('returns display price from either shape', () => {
    expect(feesCellPrice(99)).toBe(99);
    expect(feesCellPrice({ price: 50, strikeoutEnabled: true, strikeout: 80 })).toBe(50);
  });
});
