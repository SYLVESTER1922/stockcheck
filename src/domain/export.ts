import * as XLSX from 'xlsx';

export type Item = {
  name: string;
  variant: string;
  expected: number;
  cost: number;
};

/** Reads the first sheet of a Zobaze Export into Items. */
export function loadExport(data: ArrayBuffer): Item[] {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rows.map((row) => ({
    name: String(row.ITEM_NAME),
    variant: String(row.VARIANT_NAME),
    expected: Number(row.STOCK),
    cost: Number(row.COST_PRICE),
  }));
}
