import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { acknowledge, raiseCorrection, setSupplierDocument, transition } from '../src/domain/adjustments';
import { adjustView } from '../src/domain/adjustView';
import { adjustmentReportFileName, buildAdjustmentReport, type AdjustmentReport } from '../src/domain/adjustmentReport';
import type { Item } from '../src/domain/export';
import { adjustmentsGuard, isAdjustmentsReported, markAdjustmentsReported, needsGuard } from '../src/domain/replaceGuard';
import { buildReport } from '../src/domain/report';
import {
  addTally,
  editTally,
  finishItem,
  isReported,
  markReported,
  newSession,
  removeTally,
  setCounter,
  setWastage,
  type AdjustmentStatus,
  type Session,
} from '../src/domain/session';
import { parseWastage } from '../src/domain/wastage';
import { writeAdjustmentReport, writeReport } from '../src/domain/workbook';
import { META, reportSession } from './helpers/reportSession';

// T27, ADR 0007: the Adjustment Report. A separate file, a record and not security.
const AT = '2026-10-06T06:45:00.000Z';

/** Reads a workbook back without leaving its number formats in SheetJS's shared table (reading loads them, writing then lists them). */
function readClean(data: ArrayBuffer): XLSX.WorkBook {
  const before = new Set(Object.keys(XLSX.SSF.get_table()));
  const book = XLSX.read(data, { type: 'array', cellNF: true });
  const table = XLSX.SSF.get_table() as Record<string, string>;
  for (const key of Object.keys(table)) if (!before.has(key)) delete table[key];
  return book;
}
const T = (n: number) => new Date(2026, 9, 7, n, 0).toISOString(); // local time, so the expected text does not depend on the zone
const when = (n: number) => `2026-10-07 ${String(n).padStart(2, '0')}:00`;
const item = (key: string, name: string, expected: number, cost: number, over: Partial<Item> = {}): Item => ({
  key, duplicate: null, name, variant: '', sku: '', category: '', expected, cost, flags: [], ...over,
});

const I = {
  sugar: item('sku:S1', 'Sugar', 100_000, 150, { variant: '2kg', sku: 'S1' }), // 85: REMOVE 15, Applied, then 88, then a correction
  oil: item('sku:O1', 'Oil', 5_000, 200, { sku: 'O1' }), // 8: ADD 3, Supplier Document, Approved
  soap: item('name:soap|', 'Soap', -5_000, 100, { flags: ['negative-system-stock'] }), // 0: ADD 5, put on hold
  rice1: item('name:rice|#1', 'Rice', 10_000, 150, { duplicate: 1 }), // 9: REMOVE 1, nothing recorded
  rice2: item('name:rice|#2', 'Rice', 10_000, 175, { duplicate: 2 }), // 12: ADD 2, nothing recorded
  flour: item('name:flour|', 'Flour', 7_000, 300), // 6: REMOVE 1, Applied, then 8: needs a review
  tea: item('name:tea|', 'Tea', 10_000, 100), // 8: REMOVE 2, Approved, then the count is removed
  jam: item('name:jam|', 'Jam', 4_000, 100), // 3: REMOVE 1, Rejected
  honey: item('name:honey|', 'Honey', 5_000, 250), // 4: REMOVE 1, Applied, then the count is removed
  salt: item('sku:SALT', 'Salt', 100_000, 150, { sku: 'SALT' }), // 85: REMOVE 15, Wastage 10
};

const ok = (r: ReturnType<typeof transition>): Session => {
  if (!r.ok) throw new Error(r.message);
  return r.session;
};
const move = (s: Session, it: Item, to: AdjustmentStatus, o: { by?: string; note?: string; at?: string; id?: string } = {}) =>
  ok(transition(s, it, { to, by: 'Mary', note: '', at: T(1), appliedCheck: true, ...o }));
const apply = (s: Session, it: Item) => move(move(s, it, 'Approved', { by: 'Mary', at: T(1) }), it, 'Applied', { by: 'Joe', at: T(2) });

function scenario(): Session {
  let s = newSession('export.xlsx', new Date(2026, 9, 6, 2, 30).toISOString(), Object.values(I));
  const counts: [Item, number][] = [[I.sugar, 85_000], [I.oil, 8_000], [I.soap, 0], [I.rice1, 9_000], [I.rice2, 12_000], [I.flour, 6_000], [I.tea, 8_000], [I.jam, 3_000], [I.honey, 4_000], [I.salt, 85_000]];
  for (const [it, n] of counts) s = finishItem(addTally(s, it, n, AT), it, AT);
  s = setCounter(s, 'Alex Moyo');

  s = apply(s, I.sugar);
  s = editTally(s, I.sugar, 0, 88_000, T(3)); // flagged...
  s = ok(raiseCorrection(s, I.sugar, { by: 'Mary', note: 'Three more found', at: T(4) })); // ...and a correction raised

  s = ok(setSupplierDocument(s, I.oil, ' INV-204 ', 'Mary', T(3)));
  s = move(s, I.oil, 'Approved', { by: 'Mary', at: T(3) });
  s = move(s, I.soap, 'Held', { by: 'Mary', note: 'Check the storeroom', at: T(4) });

  s = apply(s, I.flour);
  s = editTally(s, I.flour, 0, 8_000, T(5)); // flagged: count changed after Applied

  s = move(s, I.tea, 'Approved', { by: 'Mary', at: T(5) });
  s = removeTally(s, I.tea, 0, T(6)); // history only: count removed

  s = move(s, I.jam, 'Rejected', { by: 'Mary', note: 'Not needed', at: T(6) });
  s = apply(s, I.honey);
  s = removeTally(s, I.honey, 0, T(7)); // flagged: count removed after Applied

  const w = parseWastage({ quantity: '10', reason: 'Expired', note: '', register: 'R-1', confirmed: true }, AT);
  if (!w.ok) throw new Error(w.message);
  return setWastage(s, I.salt, w.entry);
}
const META2 = { branch: 'Main Street', counter: 'Alex Moyo', generatedAt: T(9) };
const report = (s = scenario()): AdjustmentReport => buildAdjustmentReport(s, META2);
const row = (r: AdjustmentReport, id: string) => r.rows.find((x) => x.id === id)!;

describe('the file name', () => {
  it('is stockcheck-adjustments-<branch>-<counter>-<date>-<time>.xlsx in the phone\'s local time', () => {
    expect(adjustmentReportFileName('Main Street', 'Alex Moyo', new Date(2026, 9, 7, 9, 5))).toBe('stockcheck-adjustments-main-street-alex-moyo-2026-10-07-0905.xlsx');
    expect(adjustmentReportFileName(' Café #2 ', 'A. Moyo', new Date(2026, 0, 2, 15, 30))).toBe('stockcheck-adjustments-caf-2-a-moyo-2026-01-02-1530.xlsx');
  });
});

describe('the rows', () => {
  const r = report();

  it('has one row for every Adjustment on the Adjust tab, in the same order', () => {
    expect(r.rows.map((x) => x.id)).toEqual(adjustView(scenario()).list.map((a) => a.id));
    expect(r.rows).toHaveLength(11);
  });

  it('shows ADD or REMOVE in words, with the quantity signed and the value at cost in cents', () => {
    expect(row(r, 'sku:S1')).toMatchObject({ action: 'REMOVE', quantity: -15_000, value: -2_250, total: -15_000 });
    expect(row(r, 'sku:O1')).toMatchObject({ action: 'ADD', quantity: 3_000, value: 600 });
    expect(row(r, 'name:soap|')).toMatchObject({ action: 'ADD', quantity: 5_000, value: 500, expected: -5_000, count: 0 });
  });

  it('shows the split: Wastage and Unexplained Variance, without changing the quantity', () => {
    expect(row(r, 'sku:SALT')).toMatchObject({ action: 'REMOVE', quantity: -15_000, wastage: 10_000, unexplained: -5_000 });
    expect(row(r, 'sku:O1')).toMatchObject({ wastage: 0, unexplained: 3_000 });
  });

  it('names the Item, its Variant, and its SKU or else its Key; Duplicate Items show #n and their own cost', () => {
    expect(row(r, 'sku:S1')).toMatchObject({ name: 'Sugar', variant: '2kg', skuOrKey: 'S1', duplicate: null });
    expect(row(r, 'name:soap|')).toMatchObject({ skuOrKey: 'name:soap|' });
    expect(row(r, 'name:rice|#1')).toMatchObject({ duplicate: 1, cost: 150, status: 'Pending' });
    expect(row(r, 'name:rice|#2')).toMatchObject({ duplicate: 2, cost: 175 });
  });

  it('shows who approved and when, the Supplier Document, and who applied it and when, with the Applied Check', () => {
    expect(row(r, 'sku:O1')).toMatchObject({ status: 'Approved', approvedBy: 'Mary', approvedAt: when(3), supplierDocument: 'INV-204', appliedBy: '', appliedCheck: false });
    expect(row(r, 'name:flour|')).toMatchObject({ status: 'Applied', approvedBy: 'Mary', approvedAt: when(1), appliedBy: 'Joe', appliedAt: when(2), appliedCheck: true });
  });

  it('shows the status as shown on the tab: untouched Adjustments are Pending, an ADD with no document is Held', () => {
    expect(row(r, 'name:rice|#1').status).toBe('Pending');
    expect(row(r, 'name:rice|#2').status).toBe('Held');
    expect(row(r, 'name:soap|').status).toBe('Held');
    expect(row(r, 'name:jam|').status).toBe('Rejected');
  });

  it('shows an Applied Adjustment as it was applied, flagged "Count changed after Applied" with both Counts', () => {
    expect(row(r, 'name:flour|')).toMatchObject({
      status: 'Applied',
      action: 'REMOVE',
      quantity: -1_000,
      count: 6_000,
      review: 'Count changed after Applied: review. It was applied with a Count of 6; the Count is now 8.',
    });
  });

  it('flags a count removed after Applied', () => {
    expect(row(r, 'name:honey|').review).toBe('Count removed after Applied: review. It was applied with a Count of 4; the Item has no Count now.');
  });

  it('shows a history-only row as such, with what was approved', () => {
    expect(row(r, 'name:tea|')).toMatchObject({ review: 'History only: the count was removed after it was approved, so the Approval was cancelled.', quantity: -2_000, status: 'Pending' });
  });

  it('links a correcting Adjustment both ways, and clears the flag on the one it corrects', () => {
    expect(row(r, 'sku:S1~2')).toMatchObject({ action: 'ADD', quantity: 3_000, corrects: 'sku:S1', status: 'Held' });
    expect(row(r, 'sku:S1')).toMatchObject({ correctedBy: 'sku:S1~2', review: '' });
  });

  it('carries the Item flags and the Wastage flags', () => {
    expect(row(r, 'name:soap|').flags).toBe('Negative System Stock');
    const covering = parseWastage({ quantity: '15', reason: 'Damaged', note: '', register: 'R-2', confirmed: true }, AT);
    if (!covering.ok) throw new Error(covering.message);
    expect(row(report(setWastage(scenario(), I.salt, covering.entry)), 'sku:SALT').flags).toBe('Wastage covers the whole shortage');
  });

  it('says when an Approval was cancelled by a Count change', () => {
    const changed = editTally(move(scenario(), I.rice1, 'Approved', { at: T(8) }), I.rice1, 0, 7_000, T(9));
    expect(row(report(changed), 'name:rice|#1').review).toBe('Approval cancelled: the Count changed from 9 to 7.');
  });
});

describe('the summary', () => {
  const s = report().summary;

  it('names the branch, Counter and Export, and shows the Export date prominently', () => {
    expect(s).toMatchObject({ branch: 'Main Street', counter: 'Alex Moyo', exportFileName: 'export.xlsx', exportLoaded: '2026-10-06 02:30', generatedAt: when(9) });
  });

  it('counts by status as shown, without the history-only row', () => {
    expect(s.byStatus).toEqual({ Pending: 2, Approved: 1, Applied: 3, Rejected: 1, Held: 3 });
    expect(s.historyOnly).toBe(1);
    expect(s.needsReview).toBe(2);
  });

  it('totals ADD and REMOVE in units and value, without Rejected and history-only rows', () => {
    expect(s.totals.add).toEqual({ adjustments: 4, units: 13_000, value: 1_900 });
    expect(s.totals.remove).toEqual({ adjustments: 5, units: -33_000, value: -5_200 });
    expect(s.totals.net).toEqual({ adjustments: 9, units: -20_000, value: -3_300 });
  });

  it('says it is a record, not security, and that StockCheck never changes Zobaze', () => {
    expect(s.note).toContain('a record, not security');
    expect(s.note).toContain('StockCheck never changes Zobaze');
    expect(s.note).toContain('backup file can be edited');
  });
});

describe('the history', () => {
  const r = report();

  it('has every logged move and review action', () => {
    const logged = Object.values(scenario().adjustments).reduce((n, rec) => n + rec.log.length, 0);
    expect(r.history).toHaveLength(logged);
  });

  it('says who did what, when, and the note, in plain words', () => {
    const tea = r.history.filter((h) => h.id === 'name:tea|');
    expect(tea).toEqual([
      expect.objectContaining({ at: when(5), event: 'Approved', by: 'Mary', note: '', from: 'Pending', to: 'Approved' }),
      expect.objectContaining({ at: when(6), event: 'Count removed, so the Approval was cancelled', by: 'StockCheck (automatic)', countBefore: 8_000, countAfter: null }),
    ]);
    const soap = r.history.find((h) => h.id === 'name:soap|')!;
    expect(soap).toMatchObject({ event: 'Put on hold', by: 'Mary', note: 'Check the storeroom', name: 'Soap' });
  });

  it('includes the Supplier Document, the Applied Check, and the review actions', () => {
    expect(r.history.find((h) => h.id === 'sku:O1' && h.event === 'Supplier Document recorded')).toMatchObject({ note: 'INV-204', by: 'Mary' });
    expect(r.history.find((h) => h.id === 'name:flour|' && h.event === 'Applied')).toMatchObject({ by: 'Joe', appliedCheck: true });
    expect(r.history.find((h) => h.id === 'sku:S1' && h.event === 'Correcting Adjustment raised')).toMatchObject({ by: 'Mary', note: 'Three more found', countReviewed: 88_000 });
    expect(r.history.find((h) => h.id === 'sku:S1~2')).toMatchObject({ event: 'Correcting Adjustment raised', by: 'Mary' });
    const ack = acknowledge(editTally(apply(scenario(), I.rice1), I.rice1, 0, 7_000, T(8)), I.rice1, { by: 'Sam', note: 'Seen', at: T(9) });
    if (!ack.ok) throw new Error(ack.message);
    expect(report(ack.session).history.find((h) => h.event === 'Acknowledged, no action needed')).toMatchObject({ by: 'Sam', note: 'Seen', countReviewed: 7_000 });
  });

  it('keeps each Adjustment\'s moves in the order they happened', () => {
    for (const id of new Set(r.history.map((h) => h.id))) {
      const times = r.history.filter((h) => h.id === id).map((h) => h.at);
      expect(times).toEqual([...times].sort());
    }
  });
});

describe('the Excel file', () => {
  const buf = writeAdjustmentReport(report());
  const book = readClean(buf);
  const grid = (name: string) => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name]!, { header: 1, defval: null, blankrows: true });
  const parts = (data: ArrayBuffer, paths: string[]) => {
    const zip = XLSX.CFB.read(new Uint8Array(data), { type: 'array' });
    return Object.fromEntries(paths.map((p) => [p, new TextDecoder().decode(XLSX.CFB.find(zip, p)!.content as Uint8Array)]));
  };
  const xml = parts(buf, ['/xl/styles.xml', '/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml', '/xl/worksheets/sheet3.xml']);

  it('has three sheets: Summary, Adjustments, Adjustment History (Excel does not allow a sheet called History)', () => {
    expect(book.SheetNames).toEqual(['Summary', 'Adjustments', 'Adjustment History']);
  });

  it('Adjustments: one row per Adjustment, with the columns of the ticket, numbers as numbers', () => {
    const rows = grid('Adjustments');
    expect(rows[0]).toEqual([
      'Item', 'Variant', 'SKU or Key', 'Duplicate #', 'Cost price', 'Expected', 'Count', 'Wastage', 'Total Variance (units)', 'Unexplained Variance (units)',
      'Action', 'Quantity (units)', 'Value ($)', 'Status', 'Approved by', 'Approved at', 'Supplier Document', 'Applied by', 'Applied at', 'Applied Check',
      'Flags', 'Review', 'Corrects', 'Corrected by', 'Adjustment ID',
    ]);
    expect(rows).toHaveLength(12);
    const oil = rows.find((x) => x[24] === 'sku:O1')!;
    expect(oil.slice(0, 3)).toEqual(['Oil', null, 'O1']);
    expect(oil.slice(4, 8)).toEqual([2, 5, 8, 0]); // cost, Expected, Count, Wastage
    expect(oil.slice(10, 17)).toEqual(['ADD', 3, 6, 'Approved', 'Mary', when(3), 'INV-204']);
    expect(typeof oil[11]).toBe('number');
    expect(typeof oil[12]).toBe('number');
  });

  it('writes ADD and REMOVE in words and the quantity signed, with green and red from the number format', () => {
    const sheet = book.Sheets['Adjustments']!;
    const rows = grid('Adjustments');
    const at = (id: string) => rows.findIndex((x) => x[24] === id) + 1;
    expect(rows[at('sku:S1') - 1]![10]).toBe('REMOVE');
    expect(rows[at('sku:S1') - 1]![11]).toBe(-15);
    expect(rows[at('sku:O1') - 1]![10]).toBe('ADD');
    expect(rows[at('sku:O1') - 1]![11]).toBe(3);
    expect(sheet[`L${at('sku:O1')}`]?.z).toBe('[Color10]+#,##0.000;[Red]-#,##0.000;0.000');
    expect(sheet[`M${at('sku:O1')}`]?.z).toBe('[Color10]+"$"#,##0.00;[Red]-"$"#,##0.00;"$"0.00');
    expect(xml['/xl/styles.xml']).toContain('[Color10]');
    expect(xml['/xl/styles.xml']).toContain('[Red]');
  });

  it('keeps the existing styling: bold headers, frozen first row, a filter over every column', () => {
    for (const sheet of ['/xl/worksheets/sheet2.xml', '/xl/worksheets/sheet3.xml']) {
      expect(xml[sheet]).toContain('<pane ySplit="1"');
      expect(xml[sheet]).toMatch(/<c r="A1" s="\d+"/);
    }
    expect(xml['/xl/worksheets/sheet2.xml']).toContain('<autoFilter ref="A1:Y12"');
    expect(xml['/xl/worksheets/sheet2.xml']).toMatch(/<c r="Y1" s="\d+"/);
    expect(xml['/xl/worksheets/sheet3.xml']).toMatch(/<autoFilter ref="A1:M\d+"/);
  });

  it('Summary: the Export date is prominent, and the status counts, totals and note are there', () => {
    const rows = grid('Summary').map((x) => x.filter((c) => c !== null));
    const find = (label: string) => rows.find((x) => x[0] === label)!;
    expect(find('StockCheck Adjustment Report')).toBeTruthy();
    expect(find('Branch')).toEqual(['Branch', 'Main Street']);
    expect(find('Export file')).toEqual(['Export file', 'export.xlsx']);
    expect(find('Export loaded (quantities are measured against this Export)')).toEqual(['Export loaded (quantities are measured against this Export)', '2026-10-06 02:30']);
    expect(find('Pending')).toEqual(['Pending', 2]);
    expect(find('Held')).toEqual(['Held', 3]);
    expect(find('Applied Adjustments needing review')).toEqual(['Applied Adjustments needing review', 2]);
    expect(find('ADD')).toEqual(['ADD', 4, 13, 19]);
    expect(find('REMOVE')).toEqual(['REMOVE', 5, -33, -52]);
    expect(find('Net')).toEqual(['Net', 9, -20, -33]);
    expect(JSON.stringify(rows)).toContain('a record, not security');
    expect(JSON.stringify(rows)).toContain('Powered by Netrisyl Insights');
    // the Export date row is bold in both cells
    const sheet1 = xml['/xl/worksheets/sheet1.xml'];
    const index = grid('Summary').findIndex((x) => x[0] === 'Export loaded (quantities are measured against this Export)') + 1;
    expect(sheet1).toMatch(new RegExp(`<c r="A${index}" s="\\d+"`));
    expect(sheet1).toMatch(new RegExp(`<c r="B${index}" s="\\d+"`));
  });

  it('History: every move, with the By column and the Applied Check', () => {
    const rows = grid('Adjustment History');
    expect(rows[0]).toEqual(['Date and time', 'Item', 'Variant', 'SKU or Key', 'Adjustment ID', 'Event', 'By', 'Note', 'From', 'To', 'Count before', 'Count after', 'Count reviewed']);
    expect(rows.length - 1).toBe(report().history.length);
    expect(rows.some((x) => x[5] === 'Count removed, so the Approval was cancelled' && x[6] === 'StockCheck (automatic)')).toBe(true);
  });

  it('is wording-safe: nothing blames anyone, and it says it is a record, not security', () => {
    const text = JSON.stringify([grid('Summary'), grid('Adjustments'), grid('Adjustment History')]);
    expect(text).not.toMatch(/fraud|suspicious|tamper|theft|stole|authori[sz]|verified|careless/i);
    expect(text).toContain('not security');
  });
});

describe('a Session with nothing recorded', () => {
  it('still gives a report: every derived Adjustment is Pending, with an empty history', () => {
    const OLD = withNothing();
    const r = buildAdjustmentReport(OLD, META2);
    expect(r.rows.map((x) => x.status)).toEqual(['Pending', 'Held']);
    expect(r.history).toEqual([]);
    const book = readClean(writeAdjustmentReport(r));
    expect(book.SheetNames).toEqual(['Summary', 'Adjustments', 'Adjustment History']);
  });

  function withNothing(): Session {
    let s = newSession('e.xlsx', AT, [I.sugar, I.oil]);
    s = finishItem(addTally(s, I.sugar, 85_000, AT), I.sugar, AT);
    return finishItem(addTally(s, I.oil, 8_000, AT), I.oil, AT);
  }
});

describe('the Session Report is not changed in any way', () => {
  const PARTS = ['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml', '/xl/worksheets/sheet3.xml', '/xl/styles.xml', '/xl/workbook.xml'];
  const BASELINE: Record<string, string> = JSON.parse(readFileSync('test/fixtures/report-before-t21.json', 'utf8'));
  const partsOf = (s: Session) => {
    const zip = XLSX.CFB.read(new Uint8Array(writeReport(buildReport(s, META))), { type: 'array' });
    return Object.fromEntries(PARTS.map((p) => [p, new TextDecoder().decode(XLSX.CFB.find(zip, p)!.content as Uint8Array)]));
  };

  it('is the same file, byte for byte in every sheet, style and workbook part, whatever the Adjustments are', () => {
    const base = reportSession();
    // decisions on the T21 session: approve, apply, hold, reject
    const sugar = base.items.find((i) => i.name === 'Sugar')!;
    const oil = base.items.find((i) => i.name === 'Oil')!;
    let s = move(move(base, sugar, 'Approved'), sugar, 'Applied');
    s = move(s, oil, 'Held');
    expect(Object.keys(s.adjustments).length).toBe(2);
    expect(partsOf(s)).toEqual(BASELINE);
    expect(partsOf(base)).toEqual(BASELINE);
  });

  it('writing the Adjustment Report first leaves no number formats behind for the next workbook', () => {
    const table = () => Object.keys(XLSX.SSF.get_table()).sort();
    const before = table();
    writeAdjustmentReport(report());
    expect(table()).toEqual(before);
    expect(partsOf(reportSession())).toEqual(BASELINE); // the Session Report after it: identical to the baseline
  });

  it('and the other way round: a Session Report first changes nothing about the Adjustment Report', () => {
    const first = writeAdjustmentReport(report());
    partsOf(reportSession());
    const second = writeAdjustmentReport(report());
    const read = (b: ArrayBuffer) => XLSX.CFB.find(XLSX.CFB.read(new Uint8Array(b), { type: 'array' }), '/xl/worksheets/sheet2.xml')!.content;
    expect(Array.from(read(second) as Uint8Array)).toEqual(Array.from(read(first) as Uint8Array));
  });

  it('building and writing the Adjustment Report changes nothing in the Session', () => {
    const s = scenario();
    const copy = JSON.stringify(s);
    writeAdjustmentReport(buildAdjustmentReport(s, META2));
    expect(JSON.stringify(s)).toBe(copy);
  });

  it('marking the Adjustments reported does not touch the Session Report marker, and the report stays identical', () => {
    const s = reportSession();
    const marked = markAdjustmentsReported(s);
    expect([marked.changes, marked.reportedChanges, marked.lastChangeAt]).toEqual([s.changes, s.reportedChanges, s.lastChangeAt]);
    expect(isReported(marked)).toBe(isReported(s));
    expect(partsOf(marked)).toEqual(BASELINE);
    expect(isAdjustmentsReported(markReported(s))).toBe(false);
  });
});

describe('downloading it and the replace-guard (T26)', () => {
  /** What the screen does on download: build, write, then mark. */
  const download = (s: Session) => {
    writeAdjustmentReport(buildAdjustmentReport(s, META2));
    return markAdjustmentsReported(s);
  };

  it('clears the block for what the report covers: Approved, Pending and Held alike', () => {
    const s = markReported(scenario()); // the Counts are reported; the Oil is Approved, others Pending or Held
    expect(adjustmentsGuard(s).level).toBe('block');
    const after = download(s);
    expect(adjustmentsGuard(after)).toEqual({ level: 'none' });
    expect(needsGuard(after)).toBe(false);
    expect(buildAdjustmentReport(after, META2).rows.map((x) => x.status)).toEqual(buildAdjustmentReport(s, META2).rows.map((x) => x.status));
  });

  it('a later Approval brings the block back, for everything recorded, because the report is out of date', () => {
    const covered = download(markReported(scenario()));
    const later = markReported(move(covered, I.rice1, 'Approved', { at: T(8) }));
    expect(adjustmentsGuard(later)).toMatchObject({ level: 'block', approved: 2 }); // the Oil, and the Rice
    expect(isAdjustmentsReported(later)).toBe(false);
  });

  describe('Pending and Held records on their own', () => {
    let s = newSession('e.xlsx', AT, [I.sugar, I.oil, I.rice1]);
    for (const [it, n] of [[I.sugar, 85_000], [I.oil, 8_000], [I.rice1, 9_000]] as [Item, number][]) s = finishItem(addTally(s, it, n, AT), it, AT);
    const reported = markReported(s);

    it('a person\'s Held and a Supplier Document on a Pending ADD are a warning, and the report clears it', () => {
      const held = move(reported, I.sugar, 'Held');
      const doc = ok(setSupplierDocument(held, I.oil, 'INV-9', 'Mary', T(2)));
      expect(adjustmentsGuard(doc)).toEqual({ level: 'warn', approved: 0, pending: 1, held: 1 });
      expect(adjustmentsGuard(download(doc))).toEqual({ level: 'none' });
    });

    it('the next one after the report is a warning again, counting what was already there', () => {
      const covered = download(move(reported, I.sugar, 'Held'));
      const next = move(covered, I.rice1, 'Held');
      expect(adjustmentsGuard(next)).toEqual({ level: 'warn', approved: 0, pending: 0, held: 2 });
    });

    it('Pending and Held rows are in the report, as they are shown, even before anyone has acted on them', () => {
      const rows = buildAdjustmentReport(move(reported, I.sugar, 'Held'), META2).rows;
      expect(Object.fromEntries(rows.map((x) => [x.id, x.status]))).toEqual({ 'sku:S1': 'Held', 'sku:O1': 'Held', 'name:rice|#1': 'Pending' });
    });

    it('an untouched Session has nothing to clear, and the report does not invent a guard', () => {
      expect(adjustmentsGuard(download(reported))).toEqual({ level: 'none' });
      expect(needsGuard(download(reported))).toBe(false);
    });
  });

  it('does not clear unreported Counts', () => {
    let s = newSession('e.xlsx', AT, [I.sugar]);
    s = finishItem(addTally(s, I.sugar, 85_000, AT), I.sugar, AT);
    const after = download(move(s, I.sugar, 'Approved'));
    expect(adjustmentsGuard(after)).toEqual({ level: 'none' });
    expect(needsGuard(after)).toBe(true); // the Counts are not in a Session Report
  });
});

describe('readability polish (Item column and the Summary note)', () => {
  const longName = 'Premium Long-Grain Parboiled Basmati Rice, Family Value Bag (Imported)'; // 70 characters
  const sessionWith = (name: string): Session => {
    const it = item('name:long|', name, 10_000, 150);
    return finishItem(addTally(newSession('e.xlsx', AT, [it]), it, 8_000, AT), it, AT);
  };
  const write = (s: Session) => writeAdjustmentReport(buildAdjustmentReport(s, META2));
  const grid = (wb: XLSX.WorkBook, name: string) => XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, defval: null, blankrows: true });
  const part = (buf: ArrayBuffer, path: string) =>
    new TextDecoder().decode(XLSX.CFB.find(XLSX.CFB.read(new Uint8Array(buf), { type: 'array' }), path)!.content as Uint8Array);

  /** A column's width as Excel reads it, from the sheet's XML. */
  const colWidth = (buf: ArrayBuffer, sheet: number, column: number) =>
    Number(new RegExp(`<col min="${column}" max="${column}" width="([\\d.]+)"`).exec(part(buf, `/xl/worksheets/sheet${sheet}.xml`))?.[1]);

  it('makes the Item column wide enough for the longest name, on the Adjustments and History sheets', () => {
    const it0 = item('name:long|', longName, 10_000, 150);
    const buf = write(move(sessionWith(longName), it0, 'Held'));
    expect(colWidth(buf, 2, 1)).toBeGreaterThanOrEqual(longName.length + 1);
    expect(colWidth(buf, 3, 2)).toBeGreaterThanOrEqual(longName.length + 1); // History: Item is the second column
  });

  it('keeps the usual width for short names, and caps an absurd one', () => {
    const short = colWidth(write(sessionWith('Sugar')), 2, 1);
    expect(short).toBeGreaterThanOrEqual(28);
    expect(short).toBeLessThan(30);
    expect(colWidth(write(sessionWith('x'.repeat(300))), 2, 1)).toBeLessThanOrEqual(81);
  });

  it('puts the Summary note in one wide merged cell that wraps, in a row tall enough to read all of it', () => {
    const buf = write(scenario());
    const sheet1 = part(buf, '/xl/worksheets/sheet1.xml');
    const noteRow = grid(readClean(buf), 'Summary').findIndex((r) => String(r[0] ?? '').startsWith('StockCheck never changes Zobaze')) + 1;
    expect(noteRow).toBeGreaterThan(1);
    expect(sheet1).toContain(`<mergeCell ref="A${noteRow}:D${noteRow}"/>`);
    // the row has a custom height of several lines (the note is about 450 characters in a ~114-character-wide cell)
    const height = Number(new RegExp(`<row r="${noteRow}"[^>]* ht="([\\d.]+)"`).exec(sheet1)?.[1]);
    expect(height).toBeGreaterThanOrEqual(15 * 4);
    expect(sheet1).toMatch(new RegExp(`<row r="${noteRow}"[^>]* customHeight="1"`));
    // the note cell uses a style that wraps text and aligns to the top
    const style = Number(new RegExp(`<c r="A${noteRow}" s="(\\d+)"`).exec(sheet1)?.[1]);
    const xfs = /<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/.exec(part(buf, '/xl/styles.xml'))![1]!.match(/<xf [\s\S]*?(?:\/>|<\/xf>)/g)!;
    expect(xfs[style]).toContain('wrapText="1"');
    expect(xfs[style]).toContain('vertical="top"');
  });

  it('still holds the whole note, unchanged, in that cell', () => {
    const rows = grid(readClean(write(scenario())), 'Summary');
    expect(rows.some((r) => r[0] === report().summary.note)).toBe(true);
  });

  it('leaves the other Summary rows, and the headings, as they were', () => {
    const sheet1 = part(write(scenario()), '/xl/worksheets/sheet1.xml');
    expect(sheet1).toMatch(/<c r="A1" s="\d+" t="str"><v>StockCheck Adjustment Report<\/v>/); // still bold
    expect(sheet1.match(/<mergeCell /g)).toHaveLength(1); // only the note is merged
  });
});
