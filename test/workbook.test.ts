import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/domain/report';
import { addTally, finishItem, newSession } from '../src/domain/session';
import { writeReport } from '../src/domain/workbook';
import type { Item } from '../src/domain/export';

const sugar: Item = {
  key: 'name:sugar|2kg',
  duplicate: null,
  name: 'Sugar',
  variant: '2kg',
  sku: '',
  category: 'Grocery',
  expected: 10_000,
  cost: 150,
  flags: [],
};

const oil: Item = { ...sugar, key: 'name:oil|2l', name: 'Oil', variant: '2L', expected: 4_000, cost: 325 };

describe('writeReport', () => {
  const at = '2026-10-06T06:45:00.000Z';
  let session = finishItem(addTally(newSession('export.xlsx', at, [sugar, oil]), sugar, 9_500, at), sugar, at);
  session = addTally(session, oil, 2_000, at);
  const written = writeReport(buildReport(session, { branch: 'Main Street', counter: 'Alex', generatedAt: at }));
  // cellNF/cellStyles make SheetJS read number formats and column widths back.
  const book = XLSX.read(written, { type: 'array', cellNF: true, cellStyles: true });

  it('has the three sheets', () => {
    expect(book.SheetNames).toEqual(['Summary', 'Variance Detail', 'Recount List']);
  });

  it('writes quantities and money as numeric cells, in units and dollars', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Variance Detail']!);
    expect(rows.find((r) => r.Item === 'Sugar')).toMatchObject({
      Item: 'Sugar',
      Variant: '2kg',
      Category: 'Grocery',
      Key: 'name:sugar|2kg',
      Expected: 10,
      'Count at Done': 9.5,
      'Final Count': 9.5,
      'Variance (units)': -0.5,
      'Cost price': 1.5,
      'Variance ($)': -0.75,
      Status: 'Short',
      'Look Again prompted': 'N',
    });
    const sheet = book.Sheets['Variance Detail']!;
    const header = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]!;
    const valueCell = sheet[XLSX.utils.encode_cell({ r: 1, c: header.indexOf('Variance ($)') })];
    expect(valueCell.t).toBe('n');
  });

  it('puts the net Variance Value on the Summary as a number', () => {
    const summary = XLSX.utils.sheet_to_json<[string, unknown]>(book.Sheets.Summary!, { header: 1 });
    const net = summary.find((r) => r[0] === 'Net Variance Value (USD)');
    expect(net?.[1]).toBe(-0.75);
  });

  it('labels in-progress Items "In progress" in the file itself', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Variance Detail']!);
    expect(rows.find((r) => r.Item === 'Oil')).toMatchObject({ Status: 'In progress', 'Final Count': 2 });
    const summary = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Summary!, { header: 1 }).flat().join(' ');
    expect(summary).toContain('1 item is In progress (Done not tapped)');
  });

  it('credits Netrisyl Insights on the Summary sheet', () => {
    const summary = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Summary!, { header: 1 }).flat();
    expect(summary).toContain('Powered by Netrisyl Insights');
  });

  it('puts the target Variance Detail columns first, in order (T15)', () => {
    const header = XLSX.utils.sheet_to_json<string[]>(book.Sheets['Variance Detail']!, { header: 1 })[0];
    expect(header).toEqual([
      'Item', 'Variant', 'Category', 'Key', 'Expected', 'Count at Done', 'Final Count', 'Variance (units)',
      'Cost price', 'Variance ($)', 'Status', 'Look Again prompted', 'Count at Look Again',
      'Ended exactly at Expected', 'Flags', 'Session start', 'Duplicate #', 'SKU',
    ]);
    const recount = XLSX.utils.sheet_to_json<string[]>(book.Sheets['Recount List']!, { header: 1 })[0];
    expect(recount).toEqual(header);
  });

  it('formats units to 3 decimals and money to 2 as currency, negatives in red', () => {
    const sheet = book.Sheets['Variance Detail']!;
    const header = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]!;
    const fmt = (name: string) => sheet[XLSX.utils.encode_cell({ r: 1, c: header.indexOf(name) })]?.z;
    expect(fmt('Variance (units)')).toBe('#,##0.000;[Red]-#,##0.000');
    expect(fmt('Variance ($)')).toBe('"$"#,##0.00;[Red]-"$"#,##0.00');
  });

  it('adds an autofilter and column widths to the detail sheets', () => {
    const sheet = book.Sheets['Variance Detail']!;
    expect(sheet['!autofilter']?.ref).toMatch(/^A1:R\d+$/);
    expect(sheet['!cols']?.length).toBe(18);
  });

  it('freezes the header row and bolds headings in the written file', () => {
    const zip = XLSX.CFB.read(new Uint8Array(written), { type: 'array' });
    const xml = (path: string) => new TextDecoder().decode(XLSX.CFB.find(zip, path)!.content as Uint8Array);
    expect(xml('/xl/worksheets/sheet2.xml')).toContain('state="frozen"');
    expect(xml('/xl/worksheets/sheet3.xml')).toContain('state="frozen"');
    // SheetJS doesn't read fonts back into cells, so check the XML: a bold font, an xf using it, on A1.
    const styles = xml('/xl/styles.xml');
    const fonts = [...styles.matchAll(/<font>(.*?)<\/font>/g)].map((m) => m[1]!);
    const boldFont = fonts.findIndex((f) => f.includes('<b/>'));
    expect(boldFont).toBeGreaterThanOrEqual(0);
    const xfs = [...styles.split('<cellXfs')[1]!.matchAll(/<xf [^>]*fontId="(\d+)"/g)].map((m) => Number(m[1]));
    const boldXf = xfs.indexOf(boldFont);
    expect(xml('/xl/worksheets/sheet2.xml')).toContain(`<c r="A1" s="${boldXf}"`);
    expect(xml('/xl/worksheets/sheet1.xml')).toContain(`<c r="A1" s="${boldXf}"`);
  });

  it('has the T15 Summary sections', () => {
    const text = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Summary!, { header: 1 }).flat().join(' | ');
    for (const heading of ['% of Items counted', 'Expected value of counted Items (USD)', 'Net Variance as % of that value',
      'Variance by Category', 'Top 10 shortages', 'Top 10 overages']) expect(text).toContain(heading);
  });
});

