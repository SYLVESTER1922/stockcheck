import * as XLSX from 'xlsx';
import { parseGrid, type ExportResult } from './export';
import type { Report, ReportRow, Status } from './report';

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

/** Writes the Session Report as .xlsx (spec §4.9, T15). Quantities and money are numeric cells. */
export function writeReport(report: Report): ArrayBuffer {
  const book = XLSX.utils.book_new();
  const summary = summarySheet(report);
  XLSX.utils.book_append_sheet(book, summary.sheet, 'Summary');
  XLSX.utils.book_append_sheet(book, detailSheet(report.detail), 'Variance Detail');
  XLSX.utils.book_append_sheet(book, detailSheet(report.recount), 'Recount List');
  const plain = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  return polish(plain, { 1: summary.boldCells, 2: headerCells(), 3: headerCells() });
}

function detailSheet(rows: ReportRow[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([DETAIL_COLUMNS.map((c) => c.header), ...rows.map((r) => DETAIL_COLUMNS.map((c) => c.value(r)))]);
  DETAIL_COLUMNS.forEach((column, c) => {
    if (!column.format) return;
    for (let r = 1; r <= rows.length; r++) setFormat(sheet, r, c, column.format);
  });
  sheet['!cols'] = DETAIL_COLUMNS.map((c) => ({ wch: c.width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: DETAIL_COLUMNS.length - 1 } }) };
  return sheet;
}

const headerCells = () => DETAIL_COLUMNS.map((_, c) => XLSX.utils.encode_cell({ r: 0, c }));

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
