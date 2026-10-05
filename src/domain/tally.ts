/** Parsing what the Counter types into a Tally in thousandths (spec §4.5). */
export type TallyInput = { ok: true; value: number } | { ok: false; message: string };

const PLACES = 3;
const PLAIN = /^\d+(\.\d+)?$/;

export function parseTally(input: string): TallyInput {
  let text = input.trim();
  if (text === '') return { ok: false, message: 'Type a number.' };
  if (text.startsWith('-')) return { ok: false, message: "A count can't be negative." };

  // Some phone keypads only offer ",": one comma with no dot is the decimal point.
  const commas = text.split(',').length - 1;
  if (commas === 1 && !text.includes('.')) text = text.replace(',', '.');
  if (!PLAIN.test(text)) return { ok: false, message: 'Type a plain number, like 12 or 2.5.' };

  const [whole = '', fraction = ''] = text.split('.');
  if (fraction.length > PLACES) return { ok: false, message: 'Use at most 3 decimal places.' };
  return { ok: true, value: Number(whole) * 10 ** PLACES + Number(fraction.padEnd(PLACES, '0')) };
}
