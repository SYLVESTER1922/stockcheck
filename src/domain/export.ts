import * as XLSX from 'xlsx';
import { readCost, readQuantity } from './cells';
import { matchHeaders, type Field } from './headers';

export type ItemFlag =
  | 'blank-expected'
  | 'unreadable-expected'
  | 'negative-system-stock'
  | 'no-cost'
  | 'unreadable-cost';

export type Item = {
  name: string;
  variant: string;
  sku: string;
  category: string;
  /** Thousandths of a unit. null when the cell was unreadable. */
  expected: number | null;
  /** Cents. 0 when blank, zero or unreadable (flagged 'no-cost'). */
  cost: number;
  flags: ItemFlag[];
};

export type ExportResult =
  | { ok: true; items: Item[]; matched: Partial<Record<Field, string>> }
  | { ok: false; message: string };

/** Reads the first sheet of an Export file (spec §4.1). */
export function loadExport(data: ArrayBuffer): ExportResult {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return { ok: false, message: 'This file has no sheets.' };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  return parseGrid(grid);
}

/** Turns a grid (first row = headers) into Items. Pure: no SheetJS, no browser. */
export function parseGrid(grid: unknown[][]): ExportResult {
  const [headerRow = [], ...rows] = grid;
  const headers = headerRow.map((h) => String(h).trim());
  const match = matchHeaders(headers);
  if (!match.ok) return match;

  const text = (row: unknown[], field: Field) => {
    const column = match.columns[field];
    return column === undefined ? '' : String(row[column] ?? '').trim();
  };
  const cell = (row: unknown[], field: Field) => row[match.columns[field]!];

  const items = rows.filter((row) => text(row, 'name') !== '').map((row) => toItem(row, text, cell));
  if (items.length === 0) return { ok: false, message: 'No items found: every row has a blank item name.' };
  return { ok: true, items, matched: match.matched };
}

function toItem(
  row: unknown[],
  text: (row: unknown[], field: Field) => string,
  cell: (row: unknown[], field: Field) => unknown,
): Item {
  const expected = expectedFrom(cell(row, 'expected'));
  const cost = costFrom(cell(row, 'cost'));
  return {
    name: text(row, 'name'),
    variant: text(row, 'variant'),
    sku: text(row, 'sku'),
    category: text(row, 'category'),
    expected: expected.value,
    cost: cost.value,
    flags: [...expected.flags, ...cost.flags],
  };
}

function expectedFrom(raw: unknown): { value: number | null; flags: ItemFlag[] } {
  const reading = readQuantity(raw);
  if (reading.kind === 'blank') return { value: 0, flags: ['blank-expected'] };
  if (reading.kind === 'unreadable') return { value: null, flags: ['unreadable-expected'] };
  return { value: reading.value, flags: reading.value < 0 ? ['negative-system-stock'] : [] };
}

function costFrom(raw: unknown): { value: number; flags: ItemFlag[] } {
  const reading = readCost(raw);
  if (reading.kind === 'unreadable') return { value: 0, flags: ['no-cost', 'unreadable-cost'] };
  const value = reading.kind === 'number' ? reading.value : 0;
  return { value, flags: value === 0 ? ['no-cost'] : [] };
}

export type WarningCounts = {
  noCost: number;
  unreadableCost: number;
  blankExpected: number;
  unreadableExpected: number;
  negativeSystemStock: number;
};

/** Import warnings are derived from Item flags, never stored separately. */
export function warningCounts(items: Item[]): WarningCounts {
  const count = (flag: ItemFlag) => items.filter((i) => i.flags.includes(flag)).length;
  return {
    noCost: count('no-cost'),
    unreadableCost: count('unreadable-cost'),
    blankExpected: count('blank-expected'),
    unreadableExpected: count('unreadable-expected'),
    negativeSystemStock: count('negative-system-stock'),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Plain-words import warnings, non-zero only. Shown on import and in the Session Report. */
export function warningMessages(counts: WarningCounts): string[] {
  const messages: [number, string][] = [
    [counts.noCost, `${plural(counts.noCost, 'item has', 'items have')} no cost, so their dollar Variance counts as $0.`],
    [counts.unreadableCost, `${plural(counts.unreadableCost, 'item has', 'items have')} an unreadable cost, treated as $0.`],
    [counts.blankExpected, `${plural(counts.blankExpected, 'item has', 'items have')} a blank Expected, treated as 0.`],
    [counts.unreadableExpected, `${plural(counts.unreadableExpected, 'item has', 'items have')} an unreadable Expected, so no Variance.`],
    [counts.negativeSystemStock, `${plural(counts.negativeSystemStock, 'item has', 'items have')} Negative System Stock.`],
  ];
  return messages.filter(([n]) => n > 0).map(([, text]) => text);
}
