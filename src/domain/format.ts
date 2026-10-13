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

/** With an explicit "+" for positive values (T17: signs as well as colour). */
export const signedUsd = (cents: number) => (cents > 0 ? `+${formatUsd(cents)}` : formatUsd(cents));
export const signedQuantity = (thousandths: number) =>
  thousandths > 0 ? `+${formatQuantity(thousandths)}` : formatQuantity(thousandths);

/** An ISO time in the phone's local time, to the minute: "2026-10-06 07:05". */
export function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
