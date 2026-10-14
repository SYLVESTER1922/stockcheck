import * as XLSX from 'xlsx';
import { parseGrid, type ExportResult } from './export';
import type { AdjustmentHistoryRow, AdjustmentReport, AdjustmentReportRow } from './adjustmentReport';
import type { Report, ReportRow, Status } from './report';
import { WASTAGE_FLAG_LABEL } from './wastage';

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

// Number formats (T15). The [Red] section colours negatives without needing cell styles.
const FMT = {
  units: '#,##0.000;[Red]-#,##0.000',
  money: '"$"#,##0.00;[Red]-"$"#,##0.00',
  percent: '0.0%;[Red]-0.0%',
  count: '#,##0',
} as const;
type Format = keyof typeof FMT;

const STATUS_LABEL: Record<Status, string> = {
  SHORT: 'Short',
  OVER: 'Over',
  MATCH: 'Match',
  'IN PROGRESS': 'In progress',
  'NOT COUNTED': 'Not counted',
  'EXPECTED UNREADABLE': 'Expected unreadable',
};
/** Item flags only; In progress and Ended exactly at Expected have their own columns. */
const ITEM_FLAGS = ['Duplicate Item', 'Negative System Stock', 'No cost'];

const DETAIL_COLUMNS: { header: string; width: number; format?: Format; value: (r: ReportRow) => unknown }[] = [
  { header: 'Item', width: 28, value: (r) => r.name },
  { header: 'Variant', width: 12, value: (r) => r.variant },
  { header: 'Category', width: 16, value: (r) => r.category },
  { header: 'Key', width: 26, value: (r) => r.key },
  { header: 'Expected', width: 11, format: 'units', value: (r) => units(r.expected) },
  { header: 'Count at Done', width: 13, format: 'units', value: (r) => units(r.countAtDone) },
  { header: 'Final Count', width: 12, format: 'units', value: (r) => units(r.count) },
  { header: 'Variance (units)', width: 15, format: 'units', value: (r) => units(r.variance) },
  { header: 'Cost price', width: 11, format: 'money', value: (r) => dollars(r.cost) },
  { header: 'Variance ($)', width: 13, format: 'money', value: (r) => dollars(r.value) },
  { header: 'Status', width: 18, value: (r) => STATUS_LABEL[r.status] },
  { header: 'Look Again prompted', width: 19, value: (r) => (r.lookAgainPrompted ? 'Y' : 'N') },
  { header: 'Count at Look Again', width: 18, format: 'units', value: (r) => units(r.countAtLookAgain) },
  { header: 'Ended exactly at Expected', width: 23, value: (r) => (r.endedAtExpected ? 'Y' : '') },
  { header: 'Flags', width: 30, value: (r) => r.flags.filter((f) => ITEM_FLAGS.includes(f)).join('; ') },
  { header: 'Session start', width: 17, value: (r) => local(r.sessionStart) },
  { header: 'Duplicate #', width: 11, value: (r) => r.duplicate },
  { header: 'SKU', width: 14, value: (r) => r.sku },
];

/**
 * ADR 0007: added AFTER the last column above, and only when the Session has Wastage, so a Session
 * without Wastage gives exactly the report it always did. Insolex combines these reports outside the app.
 */
const WASTAGE_COLUMNS: typeof DETAIL_COLUMNS = [
  { header: 'Wastage', width: 10, format: 'units', value: (r) => units(r.wastage) },
  { header: 'Wastage reason', width: 15, value: (r) => r.wastageReason || null },
  { header: 'Wastage note', width: 24, value: (r) => r.wastageNote || null },
  { header: 'Register reference', width: 18, value: (r) => r.wastageRegister || null },
  { header: 'Unexplained Variance (units)', width: 16, format: 'units', value: (r) => units(r.unexplained) },
  { header: 'Wastage flags', width: 34, value: (r) => r.wastageFlags.map((f) => WASTAGE_FLAG_LABEL[f]).join('; ') || null },
];

/** Writes the Session Report as .xlsx (spec §4.9, T15). Quantities and money are numeric cells. */
export function writeReport(report: Report): ArrayBuffer {
  const book = XLSX.utils.book_new();
  const columns = report.summary.wastageItems > 0 ? [...DETAIL_COLUMNS, ...WASTAGE_COLUMNS] : DETAIL_COLUMNS;
  const summary = summarySheet(report);
  XLSX.utils.book_append_sheet(book, summary.sheet, 'Summary');
  XLSX.utils.book_append_sheet(book, detailSheet(report.detail, columns), 'Variance Detail');
  XLSX.utils.book_append_sheet(book, detailSheet(report.recount, columns), 'Recount List');
  const plain = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return polish(plain, { 1: summary.boldCells, 2: headerCells(columns), 3: headerCells(columns) });
}

function detailSheet(rows: ReportRow[], columns: typeof DETAIL_COLUMNS): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r)))]);
  columns.forEach((column, c) => {
    if (!column.format) return;
    for (let r = 1; r <= rows.length; r++) setFormat(sheet, r, c, column.format);
  });
  sheet['!cols'] = columns.map((c) => ({ wch: c.width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
  return sheet;
}

const headerCells = (columns: typeof DETAIL_COLUMNS) => columns.map((_, c) => XLSX.utils.encode_cell({ r: 0, c }));

function summarySheet(report: Report): { sheet: XLSX.WorkSheet; boldCells: string[] } {
  const s = report.summary;
  const rows: unknown[][] = [];
  const formats: [number, number, Format][] = [];
  const bold: string[] = [];
  const heading = (...cells: string[]) => {
    cells.forEach((_, c) => bold.push(XLSX.utils.encode_cell({ r: rows.length, c })));
    rows.push(cells);
  };
  const line = (label: string, value: unknown, format?: Format) => {
    if (format && value !== null && value !== '') formats.push([rows.length, 1, format]);
    rows.push([label, value]);
  };
  const blank = () => rows.push([]);
  const itemTable = (title: string, list: ReportRow[]) => {
    heading(title);
    heading('Item', 'Variant', 'Variance (units)', 'Variance ($)');
    if (list.length === 0) rows.push(['None']);
    for (const r of list) {
      formats.push([rows.length, 2, 'units'], [rows.length, 3, 'money']);
      rows.push([r.name, r.variant, units(r.variance), dollars(r.value)]);
    }
    blank();
  };

  heading('StockCheck Session Report');
  line('Branch', s.branch);
  line('Counter', s.counter);
  line('Export file', s.exportFileName);
  line('Session start (Export loaded)', local(s.sessionStart));
  line('Counting finished (last Tally)', local(s.countingFinished));
  line('Report generated', local(s.generatedAt));
  blank();

  heading('Progress');
  line('Items in Export', s.items, 'count');
  line('Items counted (Done)', s.finished, 'count');
  line('% of Items counted', s.percentCounted, 'percent');
  line('Items in progress (Done not tapped)', s.inProgress, 'count');
  line('Items not counted', s.uncounted, 'count');
  line('Matching', s.matching, 'count');
  line('Short', s.short, 'count');
  line('Over', s.over, 'count');
  blank();

  heading('Variance');
  line('Units short', units(s.unitsShort), 'units');
  line('Units over', units(s.unitsOver), 'units');
  line('Shortage value (USD)', dollars(s.shortageValue), 'money');
  line('Surplus value (USD)', dollars(s.surplusValue), 'money');
  line('Net Variance Value (USD)', dollars(s.netValue), 'money');
  line('Expected value of counted Items (USD)', dollars(s.expectedValueCounted), 'money');
  line('Net Variance as % of that value', s.netPercentOfExpected ?? '', 'percent');
  line('Items that prompted Look Again at least once', s.promptedItems, 'count');
  line('Items on the Recount List', s.recountItems, 'count');
  blank();

  heading('Variance by Category');
  heading('Category', 'Items counted', 'Variance (units)', 'Net Variance ($)');
  if (s.byCategory.length === 0) rows.push(['None']);
  for (const c of s.byCategory) {
    formats.push([rows.length, 1, 'count'], [rows.length, 2, 'units'], [rows.length, 3, 'money']);
    rows.push([c.category, c.counted, units(c.units), dollars(c.value)]);
  }
  blank();

  itemTable('Top 10 shortages', s.topShortages);
  itemTable('Top 10 overages', s.topOverages);

  heading('Warnings');
  if (s.warnings.length === 0) rows.push(['None']);
  for (const w of s.warnings) rows.push([w]);
  blank();
  heading('Note');
  rows.push([s.note]);
  blank();
  rows.push(['Powered by Netrisyl Insights']);

  // ADR 0007: after the last existing row, so nothing above moves; only when the Session has Wastage.
  if (s.wastageItems > 0) {
    blank();
    heading('Wastage');
    line('Items with Wastage', s.wastageItems, 'count');
    line('Items with a Wastage flag', s.flaggedWastageItems, 'count');
    line('Wastage Value (USD)', dollars(s.wastageValue), 'money');
    line('Unexplained Value (USD)', dollars(s.unexplainedValue), 'money');
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const [r, c, format] of formats) setFormat(sheet, r, c, format);
  sheet['!cols'] = [{ wch: 44 }, { wch: 22 }, { wch: 17 }, { wch: 17 }];
  return { sheet, boldCells: bold };
}

function setFormat(sheet: XLSX.WorkSheet, r: number, c: number, format: Format) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell?.t === 'n') cell.z = FMT[format];
}

/**
 * SheetJS Community Edition writes number formats, widths and filters but not bold text or frozen
 * panes, so we add those to the finished file's XML. Sheets are numbered from 1 in workbook order.
 */
function polish(data: ArrayBuffer, boldCells: Record<number, string[]>): ArrayBuffer {
  const zip = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
  const text = (path: string) => new TextDecoder().decode(XLSX.CFB.find(zip, path)!.content as Uint8Array);
  const put = (path: string, xml: string) => {
    const entry = XLSX.CFB.find(zip, path)!;
    entry.content = new TextEncoder().encode(xml) as typeof entry.content;
  };

  // One bold font and one cell format that uses it.
  let styles = text('/xl/styles.xml');
  const fontCount = Number(/<fonts count="(\d+)"/.exec(styles)![1]);
  const xfCount = Number(/<cellXfs count="(\d+)"/.exec(styles)![1]);
  styles = styles
    .replace(/<fonts count="\d+">/, `<fonts count="${fontCount + 1}">`)
    .replace('</fonts>', '<font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font></fonts>')
    .replace(/<cellXfs count="\d+">/, `<cellXfs count="${xfCount + 1}">`)
    .replace('</cellXfs>', `<xf numFmtId="0" fontId="${fontCount}" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>`);
  put('/xl/styles.xml', styles);

  for (const [index, cells] of Object.entries(boldCells)) {
    const path = `/xl/worksheets/sheet${index}.xml`;
    let sheet = text(path);
    for (const ref of cells) sheet = sheet.replace(new RegExp(`<c r="${ref}"(?![^>]* s=)`), `<c r="${ref}" s="${xfCount}"`);
    if (index !== '1') {
      sheet = sheet.replace(
        /<sheetView ([^>]*?)\/>/,
        '<sheetView $1><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView>',
      );
    }
    put(path, sheet);
  }
  return XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' }) as ArrayBuffer;
}

// ---- The Adjustment Report (T27, ADR 0007): a separate file; nothing above this line is used differently. ----

/**
 * Green and red come from the number format, not from cell styling, which SheetJS Community cannot
 * write: positive is green (ADD), negative is red (REMOVE). The words ADD and REMOVE are always written too.
 */
const ADJ_FMT = {
  ...FMT,
  signedUnits: '[Color10]+#,##0.000;[Red]-#,##0.000;0.000',
  signedMoney: '[Color10]+"$"#,##0.00;[Red]-"$"#,##0.00;"$"0.00',
} as const;
type AdjFormat = keyof typeof ADJ_FMT;

type Column<T> = { header: string; width: number; format?: AdjFormat; value: (row: T) => unknown };
const text = (value: string) => (value === '' ? null : value);

const ADJUSTMENT_COLUMNS: Column<AdjustmentReportRow>[] = [
  { header: 'Item', width: 28, value: (r) => r.name },
  { header: 'Variant', width: 12, value: (r) => text(r.variant) },
  { header: 'SKU or Key', width: 22, value: (r) => r.skuOrKey },
  { header: 'Duplicate #', width: 11, value: (r) => r.duplicate },
  { header: 'Cost price', width: 11, format: 'money', value: (r) => dollars(r.cost) },
  { header: 'Expected', width: 11, format: 'units', value: (r) => units(r.expected) },
  { header: 'Count', width: 11, format: 'units', value: (r) => units(r.count) },
  { header: 'Wastage', width: 10, format: 'units', value: (r) => units(r.wastage) },
  { header: 'Total Variance (units)', width: 15, format: 'signedUnits', value: (r) => units(r.total) },
  { header: 'Unexplained Variance (units)', width: 16, format: 'signedUnits', value: (r) => units(r.unexplained) },
  { header: 'Action', width: 9, value: (r) => r.action },
  { header: 'Quantity (units)', width: 14, format: 'signedUnits', value: (r) => units(r.quantity) },
  { header: 'Value ($)', width: 12, format: 'signedMoney', value: (r) => dollars(r.value) },
  { header: 'Status', width: 11, value: (r) => r.status },
  { header: 'Approved by', width: 16, value: (r) => text(r.approvedBy) },
  { header: 'Approved at', width: 17, value: (r) => text(r.approvedAt) },
  { header: 'Supplier Document', width: 18, value: (r) => text(r.supplierDocument) },
  { header: 'Applied by', width: 16, value: (r) => text(r.appliedBy) },
  { header: 'Applied at', width: 17, value: (r) => text(r.appliedAt) },
  { header: 'Applied Check', width: 13, value: (r) => (r.appliedCheck ? 'Ticked' : null) },
  { header: 'Flags', width: 34, value: (r) => text(r.flags) },
  { header: 'Review', width: 60, value: (r) => text(r.review) },
  { header: 'Corrects', width: 22, value: (r) => text(r.corrects) },
  { header: 'Corrected by', width: 22, value: (r) => text(r.correctedBy) },
  { header: 'Adjustment ID', width: 26, value: (r) => r.id },
];

const HISTORY_COLUMNS: Column<AdjustmentHistoryRow>[] = [
  { header: 'Date and time', width: 17, value: (r) => r.at },
  { header: 'Item', width: 28, value: (r) => r.name },
  { header: 'Variant', width: 12, value: (r) => text(r.variant) },
  { header: 'SKU or Key', width: 22, value: (r) => r.skuOrKey },
  { header: 'Adjustment ID', width: 26, value: (r) => r.id },
  { header: 'Event', width: 42, value: (r) => r.event },
  { header: 'By', width: 22, value: (r) => text(r.by) },
  { header: 'Note', width: 34, value: (r) => text(r.note) },
  { header: 'From', width: 10, value: (r) => text(r.from) },
  { header: 'To', width: 10, value: (r) => text(r.to) },
  { header: 'Count before', width: 13, format: 'units', value: (r) => units(r.countBefore) },
  { header: 'Count after', width: 12, format: 'units', value: (r) => units(r.countAfter) },
  { header: 'Count reviewed', width: 14, format: 'units', value: (r) => units(r.countReviewed) },
];

/**
 * Writes the Adjustment Report as .xlsx: Summary, Adjustments, Adjustment History (Excel reserves the
 * name History). Quantities and money are numeric cells.
 */
export function writeAdjustmentReport(report: AdjustmentReport): ArrayBuffer {
  return withoutLeftoverNumberFormats(() => {
    const book = XLSX.utils.book_new();
    const summary = adjustmentSummarySheet(report);
    XLSX.utils.book_append_sheet(book, summary.sheet, 'Summary');
    XLSX.utils.book_append_sheet(book, tableSheet(report.rows, ADJUSTMENT_COLUMNS), 'Adjustments');
    XLSX.utils.book_append_sheet(book, tableSheet(report.history, HISTORY_COLUMNS), 'Adjustment History');
    // Item names must show: the Item column is as wide as the longest name (within limits).
    book.Sheets['Adjustments']!['!cols']![0] = { wch: itemColumnWidth(report.rows.map((r) => r.name)) };
    book.Sheets['Adjustment History']!['!cols']![1] = { wch: itemColumnWidth(report.history.map((h) => h.name)) };
    const plain = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
    const headers = (count: number) => Array.from({ length: count }, (_, c) => XLSX.utils.encode_cell({ r: 0, c }));
    const polished = polish(plain, { 1: summary.boldCells, 2: headers(ADJUSTMENT_COLUMNS.length), 3: headers(HISTORY_COLUMNS.length) });
    return wrapCells(polished, { 1: [summary.noteCell] });
  });
}

const ITEM_COLUMN = { min: 28, max: 80 };
/** Wide enough for the longest Item name, never narrower than the usual column and never absurd. */
const itemColumnWidth = (names: string[]) => Math.min(ITEM_COLUMN.max, Math.max(ITEM_COLUMN.min, ...names.map((n) => n.length + 2)));

/**
 * SheetJS Community cannot write text wrapping, so, like the bold headings, it is added to the finished
 * file's XML: one cell style that wraps and aligns to the top, applied to the given cells (by sheet number).
 * Runs after `polish`, which is not changed.
 */
function wrapCells(data: ArrayBuffer, cells: Record<number, string[]>): ArrayBuffer {
  const zip = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
  const read = (path: string) => new TextDecoder().decode(XLSX.CFB.find(zip, path)!.content as Uint8Array);
  const put = (path: string, xml: string) => {
    const entry = XLSX.CFB.find(zip, path)!;
    entry.content = new TextEncoder().encode(xml) as typeof entry.content;
  };
  let styles = read('/xl/styles.xml');
  const xfCount = Number(/<cellXfs count="(\d+)"/.exec(styles)![1]);
  styles = styles
    .replace(/<cellXfs count="\d+">/, `<cellXfs count="${xfCount + 1}">`)
    .replace('</cellXfs>', '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>');
  put('/xl/styles.xml', styles);
  for (const [index, refs] of Object.entries(cells)) {
    const path = `/xl/worksheets/sheet${index}.xml`;
    let sheet = read(path);
    for (const ref of refs) sheet = sheet.replace(new RegExp(`<c r="${ref}"(?![^>]* s=)`), `<c r="${ref}" s="${xfCount}"`);
    put(path, sheet);
  }
  return XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' }) as ArrayBuffer;
}

/**
 * SheetJS keeps the number formats it has met in a table shared by every workbook in the page. Left
 * alone, the green and red formats of this report would show up (unused) in the next Session Report,
 * which must stay exactly as it always was. So the table is put back as it was found.
 */
function withoutLeftoverNumberFormats<T>(write: () => T): T {
  const before = new Set(Object.keys(XLSX.SSF.get_table()));
  try {
    return write();
  } finally {
    // The table object is replaced during a write, so it is fetched again here, not before.
    const table = XLSX.SSF.get_table() as Record<string, string>;
    for (const key of Object.keys(table)) if (!before.has(key)) delete table[key];
  }
}

function tableSheet<T>(rows: T[], columns: Column<T>[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([columns.map((c) => c.header), ...rows.map((r) => columns.map((c) => c.value(r)))]);
  columns.forEach((column, c) => {
    if (!column.format) return;
    for (let r = 1; r <= rows.length; r++) setAdjFormat(sheet, r, c, column.format);
  });
  sheet['!cols'] = columns.map((c) => ({ wch: c.width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: columns.length - 1 } }) };
  return sheet;
}

function setAdjFormat(sheet: XLSX.WorkSheet, r: number, c: number, format: AdjFormat) {
  const cell = sheet[XLSX.utils.encode_cell({ r, c })];
  if (cell?.t === 'n') cell.z = ADJ_FMT[format];
}

function adjustmentSummarySheet(report: AdjustmentReport): { sheet: XLSX.WorkSheet; boldCells: string[]; noteCell: string } {
  const s = report.summary;
  const rows: unknown[][] = [];
  const formats: [number, number, AdjFormat][] = [];
  const bold: string[] = [];
  const emphasise = (row: number, columns: number) => {
    for (let c = 0; c < columns; c++) bold.push(XLSX.utils.encode_cell({ r: row, c }));
  };
  const heading = (...cells: string[]) => {
    emphasise(rows.length, cells.length);
    rows.push(cells);
  };
  const line = (label: string, value: unknown, format?: AdjFormat) => {
    if (format && value !== null && value !== '') formats.push([rows.length, 1, format]);
    rows.push([label, value]);
  };
  const blank = () => rows.push([]);

  heading('StockCheck Adjustment Report');
  line('Branch', s.branch);
  line('Counter', s.counter);
  line('Export file', s.exportFileName);
  emphasise(rows.length, 2); // the Export date is the one that matters: every quantity is measured against it
  line('Export loaded (quantities are measured against this Export)', s.exportLoaded);
  line('Report generated', s.generatedAt);
  blank();

  heading('Adjustments by status');
  heading('Status', 'Adjustments');
  for (const status of ['Pending', 'Approved', 'Applied', 'Rejected', 'Held'] as const) line(status, s.byStatus[status], 'count');
  line('History only (count removed or changed)', s.historyOnly, 'count');
  line('Applied Adjustments needing review', s.needsReview, 'count');
  blank();

  heading('Totals by action (Rejected and history-only rows are not included)');
  heading('Action', 'Adjustments', 'Units', 'Value ($)');
  for (const [label, t] of [['ADD', s.totals.add], ['REMOVE', s.totals.remove], ['Net', s.totals.net]] as const) {
    formats.push([rows.length, 1, 'count'], [rows.length, 2, 'signedUnits'], [rows.length, 3, 'signedMoney']);
    rows.push([label, t.adjustments, units(t.units), dollars(t.value)]);
  }
  blank();

  heading('Note');
  const noteRow = rows.length;
  rows.push([s.note]);
  blank();
  rows.push(['Powered by Netrisyl Insights']);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  for (const [r, c, format] of formats) setAdjFormat(sheet, r, c, format);
  const widths = [58, 22, 17, 17];
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  // The note is one wide merged cell across A to D that wraps, in a row tall enough for all of it
  // (Excel does not size merged cells by itself): about 90% of the width fits per line, 15 points a line.
  sheet['!merges'] = [{ s: { r: noteRow, c: 0 }, e: { r: noteRow, c: widths.length - 1 } }];
  const lines = Math.ceil(s.note.length / (widths.reduce((a, b) => a + b, 0) * 0.9));
  sheet['!rows'] = [];
  sheet['!rows'][noteRow] = { hpt: lines * 15 + 4 };
  return { sheet, boldCells: bold, noteCell: XLSX.utils.encode_cell({ r: noteRow, c: 0 }) };
}
