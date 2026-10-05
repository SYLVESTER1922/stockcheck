/** Variance Value in cents (spec §4.7). Integer maths only; one rounding, half away from zero like Excel's ROUND. */
export function varianceValue(varianceThousandths: number, costCents: number): number {
  const exact = varianceThousandths * costCents; // in thousandths of a cent: an exact integer
  const abs = Math.abs(exact);
  const cents = Math.floor(abs / 1000) + (abs % 1000 >= 500 ? 1 : 0);
  return (exact < 0 ? -cents : cents) + 0; // + 0 turns -0 into 0
}
