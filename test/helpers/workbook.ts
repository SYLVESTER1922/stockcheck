import * as XLSX from 'xlsx';

/** Builds an in-memory .xlsx from rows (first row = headers), as a browser File would give it. */
export function makeExport(rows: unknown[][]): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Inventory');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}
