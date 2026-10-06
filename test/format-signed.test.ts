import { describe, expect, it } from 'vitest';
import { signedQuantity, signedUsd } from '../src/domain/format';

// T17: a sign on every value, so meaning never relies on colour alone.
describe('signed formatting', () => {
  it.each([
    [135, '+$1.35'],
    [-665, '−$6.65'],
    [0, '$0.00'],
  ])('signedUsd(%i) → %s', (cents, text) => expect(signedUsd(cents)).toBe(text));

  it.each([
    [3_000, '+3'],
    [-2_500, '−2.5'],
    [0, '0'],
  ])('signedQuantity(%i) → %s', (thousandths, text) => expect(signedQuantity(thousandths)).toBe(text));
});
