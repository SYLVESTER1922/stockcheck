import { describe, expect, it } from 'vitest';
import { readCost, readQuantity } from '../src/domain/cells';

// Spec §4.2. Quantities are read in thousandths, cost in cents.
describe('readQuantity (Expected, in thousandths)', () => {
  it.each([
    ['numeric 2.5', 2.5, { kind: 'number', value: 2500 }],
    ['numeric 0', 0, { kind: 'number', value: 0 }],
    ['numeric -3', -3, { kind: 'number', value: -3000 }],
    ['blank', '', { kind: 'blank' }],
    ['whitespace only', '   ', { kind: 'blank' }],
    ['plain number text " 7 "', ' 7 ', { kind: 'number', value: 7000 }],
    ['text "-3"', '-3', { kind: 'number', value: -3000 }],
    ['text "-0" is plain zero', '-0', { kind: 'number', value: 0 }],
    ['text "2.125"', '2.125', { kind: 'number', value: 2125 }],
    ['text "$1,200.50"', '$1,200.50', { kind: 'unreadable' }],
    ['text "1,200"', '1,200', { kind: 'unreadable' }],
    ['text "12 pcs"', '12 pcs', { kind: 'unreadable' }],
    ['text "N/A"', 'N/A', { kind: 'unreadable' }],
    ['text "-"', '-', { kind: 'unreadable' }],
    ['text "see note"', 'see note', { kind: 'unreadable' }],
    ['text "12,5"', '12,5', { kind: 'unreadable' }],
    ['text "1.200,50"', '1.200,50', { kind: 'unreadable' }],
    ['more than 3 decimals (numeric)', 1.2345, { kind: 'unreadable' }],
    ['more than 3 decimals (text)', '1.2345', { kind: 'unreadable' }],
    ['binary noise is not a decimal place', 1.1000000000000001, { kind: 'number', value: 1100 }],
    ['boolean cell', true, { kind: 'unreadable' }],
  ])('%s', (_label, cell, expected) => {
    expect(readQuantity(cell)).toEqual(expected);
  });
});

describe('readCost (in cents)', () => {
  it.each([
    ['numeric 1.5', 1.5, { kind: 'number', value: 150 }],
    ['numeric 3.25', 3.25, { kind: 'number', value: 325 }],
    ['binary noise 1.1000000000000001', 1.1000000000000001, { kind: 'number', value: 110 }],
    ['blank', '', { kind: 'blank' }],
    ['text "0.45"', '0.45', { kind: 'number', value: 45 }],
    ['more than 2 decimals (numeric)', 0.125, { kind: 'unreadable' }],
    ['more than 2 decimals (text)', '1.234', { kind: 'unreadable' }],
    ['text "$1.50"', '$1.50', { kind: 'unreadable' }],
  ])('%s', (_label, cell, expected) => {
    expect(readCost(cell)).toEqual(expected);
  });
});
