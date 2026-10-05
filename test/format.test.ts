import { describe, expect, it } from 'vitest';
import { formatQuantity, formatUsd } from '../src/domain/format';

describe('formatQuantity (from thousandths)', () => {
  it.each([
    [2500, '2.5'],
    [10_000, '10'],
    [125, '0.125'],
    [-3000, '−3'],
    [1_234_500, '1,234.5'],
    [0, '0'],
  ])('%i → %s', (thousandths, text) => {
    expect(formatQuantity(thousandths)).toBe(text);
  });
});

describe('formatUsd (from cents)', () => {
  it.each([
    [150, '$1.50'],
    [123_456, '$1,234.56'],
    [-340, '−$3.40'],
    [0, '$0.00'],
  ])('%i → %s', (cents, text) => {
    expect(formatUsd(cents)).toBe(text);
  });
});
