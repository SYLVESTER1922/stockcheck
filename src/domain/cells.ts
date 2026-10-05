/**
 * Reading Expected and cost cells into exact integers (spec §4.2, §4.7).
 * Quantities become thousandths, costs become cents, so no float is ever stored.
 */
export type CellReading = { kind: 'number'; value: number } | { kind: 'blank' } | { kind: 'unreadable' };

const QUANTITY_PLACES = 3;
const COST_PLACES = 2;
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export const readQuantity = (cell: unknown) => readScaled(cell, QUANTITY_PLACES);
export const readCost = (cell: unknown) => readScaled(cell, COST_PLACES);

function readScaled(cell: unknown, places: number): CellReading {
  if (cell === null || cell === undefined) return { kind: 'blank' };
  if (typeof cell === 'number') return fromNumber(cell, places);
  if (typeof cell === 'string') return fromText(cell.trim(), places);
  return { kind: 'unreadable' };
}

function fromNumber(n: number, places: number): CellReading {
  if (!Number.isFinite(n)) return { kind: 'unreadable' };
  const scaled = n * 10 ** places;
  const whole = Math.round(scaled);
  // A stored 1.1000000000000001 is binary noise, not a 16th decimal place.
  if (Math.abs(scaled - whole) > 1e-6) return { kind: 'unreadable' };
  return { kind: 'number', value: whole + 0 }; // + 0 turns -0 into 0
}

function fromText(text: string, places: number): CellReading {
  if (text === '') return { kind: 'blank' };
  if (!PLAIN_NUMBER.test(text)) return { kind: 'unreadable' };
  const negative = text.startsWith('-');
  const [whole = '', fraction = ''] = text.replace('-', '').split('.');
  if (fraction.length > places) return { kind: 'unreadable' };
  const value = Number(whole) * 10 ** places + Number(fraction.padEnd(places, '0'));
  return { kind: 'number', value: (negative ? -value : value) + 0 }; // + 0 turns -0 into 0
}
