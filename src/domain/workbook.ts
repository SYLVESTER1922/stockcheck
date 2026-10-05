import * as XLSX from 'xlsx';
import { parseGrid, type ExportResult } from './export';

/**
 * The only module that imports SheetJS. The UI loads it on demand (dynamic import),
 * so the first page load on a cheap phone doesn't download the spreadsheet library.
 */
export function loadExport(data: ArrayBuffer): ExportResult {
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0] ?? ''];
  if (!sheet) return { ok: false, message: 'This file has no sheets.' };
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false });
  return parseGrid(grid);
}
