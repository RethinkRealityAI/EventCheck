import type { FeesCell, FeesCellValue } from '../types';

/** Normalize a stored fees cell (legacy bare number or rich object). */
export function parseFeesCell(raw: unknown): FeesCell {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'price' in (raw as object)) {
    const c = raw as FeesCell;
    const price = Number(c.price);
    const strikeout = c.strikeout == null ? null : Number(c.strikeout);
    return {
      price: Number.isFinite(price) ? price : 0,
      strikeout: strikeout != null && Number.isFinite(strikeout) ? strikeout : null,
      strikeoutEnabled: c.strikeoutEnabled === true,
    };
  }
  const n = Number(raw);
  return {
    price: Number.isFinite(n) ? n : 0,
    strikeout: null,
    strikeoutEnabled: false,
  };
}

export function feesCellPrice(raw: unknown): number {
  return parseFeesCell(raw).price;
}

/** When strikeout is on and higher than the display price, return the struck amount. */
export function feesCellStrikeoutAmount(raw: unknown): number | null {
  const c = parseFeesCell(raw);
  if (!c.strikeoutEnabled || c.strikeout == null) return null;
  if (!(c.strikeout > c.price)) return null;
  return c.strikeout;
}

/** Persist as a bare number when strikeout is off (keeps defaults compact). */
export function serializeFeesCell(cell: FeesCell): FeesCellValue {
  if (!cell.strikeoutEnabled || cell.strikeout == null) return cell.price;
  return {
    price: cell.price,
    strikeout: cell.strikeout,
    strikeoutEnabled: true,
  };
}
