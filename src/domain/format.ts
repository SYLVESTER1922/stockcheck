/** Display formatting from the integer units we store (spec §4.7). Uses integer maths only. */
const MINUS = '−';
const group = (n: number) => n.toLocaleString('en-US');

export function formatQuantity(thousandths: number): string {
  const abs = Math.abs(thousandths);
  const fraction = String(abs % 1000).padStart(3, '0').replace(/0+$/, '');
  const text = group(Math.floor(abs / 1000)) + (fraction ? `.${fraction}` : '');
  return thousandths < 0 ? MINUS + text : text;
}

export function formatUsd(cents: number): string {
  const abs = Math.abs(cents);
  const text = `$${group(Math.floor(abs / 100))}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? MINUS + text : text;
}
