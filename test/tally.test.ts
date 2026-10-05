import { describe, expect, it } from 'vitest';
import { parseTally } from '../src/domain/tally';

// Spec §4.5: a Tally is ≥ 0 with up to 3 decimals; one comma may be the decimal point.
describe('parseTally', () => {
  it.each([
    ['12', 12_000],
    [' 7 ', 7_000],
    ['0', 0],
    ['2.5', 2_500],
    ['12,5', 12_500],
    ['0,125', 125],
    ['1.250', 1_250],
  ])('accepts %j as %i thousandths', (text, value) => {
    expect(parseTally(text)).toEqual({ ok: true, value });
  });

  it.each([
    ['', 'Type a number.'],
    ['   ', 'Type a number.'],
    ['-3', "A count can't be negative."],
    ['1.2345', 'Use at most 3 decimal places.'],
    ['1,234.5', 'Type a plain number, like 12 or 2.5.'],
    ['1,2,3', 'Type a plain number, like 12 or 2.5.'],
    ['12 pcs', 'Type a plain number, like 12 or 2.5.'],
    ['abc', 'Type a plain number, like 12 or 2.5.'],
  ])('rejects %j', (text, message) => {
    expect(parseTally(text)).toEqual({ ok: false, message });
  });
});
