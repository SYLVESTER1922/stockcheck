import * as XLSX from 'xlsx';
import { parseGrid, type ExportResult } from './export';
import type { Report } from './report';

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

const units = (thousandths: number | null) => (thousandths === null ? null : thousandths / 1000);
const dollars = (cents: number | null) => (cents === null ? null : cents / 100);
const local = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const DETAIL_HEADER = [
  'Session start',
  'Category',
  'Item name',
  'Variant',
  'Duplicate #',
  'SKU',
  'Expected',
  'Count',
  'Count at Done',
  'Variance',
  'Cost',
  'Variance Value',
  'Status',
  'Count at Look Again',
  'Flags',
];
const MONEY_COLUMNS = [DETAIL_HEADER.indexOf('Cost'), DETAIL_HEADER.indexOf('Variance Value')];

/** Writes the Session Report as .xlsx (spec §4.9). Quantities and money are numeric cells. */
export function writeReport(report: Report): ArrayBuffer {
  const s = report.summary;
  const summary: unknown[][] = [
    ['StockCheck Session Report'],
    ['Branch', s.branch],
    ['Counter', s.counter],
    ['Export file', s.exportFileName],
    ['Session start (Export loaded)', local(s.sessionStart)],
    ['Counting finished (last Tally)', local(s.countingFinished)],
    ['Report generated', local(s.generatedAt)],
    [],
    ['Items in Export', s.items],
    ['Items counted (Done)', s.finished],
    ['Items in progress (Done not tapped)', s.inProgress],
    ['Items not counted', s.uncounted],
    ['Matching', s.matching],
    ['Short', s.short],
    ['Over', s.over],
    ['Units short', units(s.unitsShort)],
    ['Units over', units(s.unitsOver)],
    ['Shortage value (USD)', dollars(s.shortageValue)],
    ['Surplus value (USD)', dollars(s.surplusValue)],
    ['Net Variance Value (USD)', dollars(s.netValue)],
    ['Items that prompted Look Again at least once', s.promptedItems],
    ['Items on the Recount List', s.recountItems],
    [],
    ['Warnings', s.warnings.length === 0 ? 'None' : s.warnings[0]],
    ...s.warnings.slice(1).map((w) => ['', w]),
    [],
    ['Note', s.note],
    [],
    ['Powered by Netrisyl Insights'],
  ];

  const toCells = (rows: Report['detail']) => [
    DETAIL_HEADER,
    ...rows.map((r) => [
      local(r.sessionStart),
      r.category,
      r.name,
      r.variant,
      r.duplicate,
      r.sku,
      units(r.expected),
      units(r.count),
      units(r.countAtDone),
      units(r.variance),
      dollars(r.cost),
      dollars(r.value),
      r.status,
      units(r.countAtLookAgain),
      r.flags.join('; '),
    ]),
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), 'Summary');
  XLSX.utils.book_append_sheet(book, moneyFormatted(XLSX.utils.aoa_to_sheet(toCells(report.detail))), 'Variance Detail');
  XLSX.utils.book_append_sheet(book, moneyFormatted(XLSX.utils.aoa_to_sheet(toCells(report.recount))), 'Recount List');
  return XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
}

function moneyFormatted(sheet: XLSX.WorkSheet): XLSX.WorkSheet {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1');
  for (let r = 1; r <= range.e.r; r++) {
    for (const c of MONEY_COLUMNS) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell?.t === 'n') cell.z = '#,##0.00';
    }
  }
  return sheet;
}
