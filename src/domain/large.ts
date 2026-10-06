/**
 * Large Variance (spec §4.6). Starting values from Q19; tune after the pilot.
 * Two constants so Look Again and the Recount List can diverge later. No settings screen.
 */
export type Threshold = { dollars: number; units: number; percent: number };

export const LOOK_AGAIN: Threshold = { dollars: 5, units: 2, percent: 20 };
export const RECOUNT_LIST: Threshold = { dollars: 5, units: 2, percent: 20 };

/** All in integers: Variance and Expected in thousandths, value in cents. Multiplies, never divides. */
export function isLarge(line: { variance: number; value: number; expected: number }, t: Threshold): boolean {
  const variance = Math.abs(line.variance);
  if (Math.abs(line.value) >= t.dollars * 100) return true;
  return variance >= t.units * 1000 && variance * 100 >= t.percent * Math.abs(line.expected);
}
