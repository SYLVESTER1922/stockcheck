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

describe('writeReport', () => {
  const at = '2026-10-06T06:45:00.000Z';
  const session = finishItem(addTally(newSession('export.xlsx', at, [sugar]), sugar, 9_500, at), sugar, at);
  const book = XLSX.read(
    writeReport(buildReport(session, { branch: 'Main Street', counter: 'Alex', generatedAt: at })),
    { type: 'array' },
  );

  it('has the three sheets', () => {
    expect(book.SheetNames).toEqual(['Summary', 'Variance Detail', 'Recount List']);
  });

  it('writes quantities and money as numeric cells, in units and dollars', () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets['Variance Detail']!);
    expect(rows[0]).toMatchObject({ Expected: 10, Count: 9.5, Variance: -0.5, Cost: 1.5, 'Variance Value': -0.75 });
    const sheet = book.Sheets['Variance Detail']!;
    const header = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0]!;
    const valueCell = sheet[XLSX.utils.encode_cell({ r: 1, c: header.indexOf('Variance Value') })];
    expect(valueCell.t).toBe('n');
  });

  it('puts the net Variance Value on the Summary as a number', () => {
    const summary = XLSX.utils.sheet_to_json<[string, unknown]>(book.Sheets.Summary!, { header: 1 });
    const net = summary.find((r) => r[0] === 'Net Variance Value (USD)');
    expect(net?.[1]).toBe(-0.75);
  });
});
