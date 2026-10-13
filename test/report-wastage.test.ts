import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildReport, type Report, type ReportRow } from '../src/domain/report';
import { setWastage, type Session } from '../src/domain/session';
import { parseWastage } from '../src/domain/wastage';
import { writeReport } from '../src/domain/workbook';
import { AT, ITEMS, META, reportSession } from './helpers/reportSession';

// T21, ADR 0007. Insolex combines these reports outside the app, so nothing existing may move.
const PARTS = ['/xl/worksheets/sheet1.xml', '/xl/worksheets/sheet2.xml', '/xl/worksheets/sheet3.xml', '/xl/styles.xml', '/xl/workbook.xml'];
const BASELINE: Record<string, string> = JSON.parse(readFileSync('test/fixtures/report-before-t21.json', 'utf8'));

function parts(session: Session): Record<string, string> {
  const zip = XLSX.CFB.read(new Uint8Array(writeReport(buildReport(session, META))), { type: 'array' });
  return Object.fromEntries(PARTS.map((p) => [p, new TextDecoder().decode(XLSX.CFB.find(zip, p)!.content as Uint8Array)]));
}
const book = (session: Session) => XLSX.read(writeReport(buildReport(session, META)), { type: 'array', cellNF: true });
const grid = (b: XLSX.WorkBook, sheet: string) => XLSX.utils.sheet_to_json<unknown[]>(b.Sheets[sheet]!, { header: 1, defval: null, blankrows: true });

const wasted = (session: Session, item: (typeof ITEMS)[keyof typeof ITEMS], quantity: string, reason = 'Expired' as const) => {
  const r = parseWastage({ quantity, reason, note: '', register: 'R-1', confirmed: true }, AT);
  if (!r.ok) throw new Error(r.message);
  return setWastage(session, item, r.entry);
};

/** Sugar −15 with Wastage 15 (covers it), Rice −6 with 8 (exceeds), Oil +1 with 1 (on a surplus). */
function withWastage(): Session {
  return wasted(wasted(wasted(reportSession(), ITEMS.short, '15'), ITEMS.big, '8'), ITEMS.over, '1');
}

const NEW_ROW_FIELDS = ['wastage', 'wastageReason', 'wastageNote', 'wastageRegister', 'wastageFlags', 'unexplained'];
const EXISTING_COLUMNS = 18; // Item … SKU, as in T15
const NEW_HEADERS = ['Wastage', 'Wastage reason', 'Wastage note', 'Register reference', 'Unexplained Variance (units)', 'Wastage flags'];

describe('a Session with no Wastage gives today\'s report, cell for cell', () => {
  it('writes the very same sheets, styles and workbook parts as before T21', () => {
    expect(parts(reportSession())).toEqual(BASELINE);
  });

  it('adds no Wastage columns and no Wastage lines', () => {
    const b = book(reportSession());
    expect((grid(b, 'Variance Detail')[0] as unknown[]).length).toBe(EXISTING_COLUMNS);
    expect((grid(b, 'Variance Detail')[0] as unknown[]).at(-1)).toBe('SKU');
    expect(JSON.stringify(grid(b, 'Summary'))).not.toContain('Wastage');
  });

  it('is also identical when the only Wastage is a stray entry for an Item that is not Done', () => {
    const stray: Session = { ...reportSession(), wastage: { [ITEMS.progress.key]: { quantity: 1000, reason: 'Expired', note: '', register: 'R', notDeductedConfirmed: true, at: AT } } };
    expect(parts(stray)).toEqual(BASELINE);
  });
});

describe('the report model with Wastage', () => {
  const report = buildReport(withWastage(), META);
  const row = (name: string) => report.detail.find((r) => r.name === name)!;

  it('shows Wastage, the reason, the register reference and Unexplained on the Item', () => {
    expect(row('Sugar')).toMatchObject({ wastage: 15_000, wastageReason: 'Expired', wastageRegister: 'R-1', unexplained: 0 });
    expect(row('Rice')).toMatchObject({ wastage: 8_000, unexplained: 2_000 });
    expect(row('Oil')).toMatchObject({ wastage: 1_000, unexplained: 2_000 });
  });

  it('flags Wastage that covers the shortage, exceeds it, and sits on a surplus', () => {
    expect(row('Sugar').wastageFlags).toEqual(['covers-shortage']);
    expect(row('Rice').wastageFlags).toEqual(['exceeds-shortage']);
    expect(row('Oil').wastageFlags).toEqual(['on-surplus']);
  });

  it('gives an Item without Wastage no Wastage, and Unexplained equal to its Variance', () => {
    expect(row('Salt')).toMatchObject({ wastage: null, wastageFlags: [], unexplained: 0 });
    expect(row('Soap')).toMatchObject({ wastage: null, unexplained: row('Soap').variance });
  });

  it('leaves Unexplained blank where there is no Variance: in progress, Uncounted, Expected unreadable', () => {
    expect(row('Tea').unexplained).toBeNull();
    expect(row('Flour').unexplained).toBeNull();
    expect(row('Jam').unexplained).toBeNull();
  });

  it('totals Wastage Value and Unexplained Value, so that Net + Wastage = Unexplained', () => {
    // Wastage: 15×$1.50 + 8×$1.50 + 1×$2.00 = $36.50. Net Variance Value is −$29.50.
    expect(report.summary).toMatchObject({ wastageItems: 3, flaggedWastageItems: 3, wastageValue: 3_650, unexplainedValue: 700, netValue: -2_950 });
    expect(report.summary.netValue + report.summary.wastageValue).toBe(report.summary.unexplainedValue);
  });

  it('leaves Variance, Variance Value, Look Again, totals and the Recount List exactly as they were', () => {
    const before = buildReport(reportSession(), META);
    expect(report.detail.map((r) => [r.key, r.status, r.count, r.variance, r.value, r.recount, r.lookAgainPrompted, r.countAtDone, r.countAtLookAgain])).toEqual(
      before.detail.map((r) => [r.key, r.status, r.count, r.variance, r.value, r.recount, r.lookAgainPrompted, r.countAtDone, r.countAtLookAgain]),
    );
    expect(report.recount.map((r) => r.key)).toEqual(before.recount.map((r) => r.key));
    const plain = (r: ReportRow) => Object.fromEntries(Object.entries(r).filter(([k]) => !NEW_ROW_FIELDS.includes(k)));
    const strip = (summary: Report['summary']) => {
      const { wastageItems, flaggedWastageItems, wastageValue, unexplainedValue, topShortages, topOverages, ...rest } = summary;
      return { ...rest, topShortages: topShortages.map(plain), topOverages: topOverages.map(plain) };
    };
    expect(strip(report.summary)).toEqual(strip(before.summary));
    expect(report.detail.map(plain)).toEqual(before.detail.map(plain));
    expect(report.recount.map(plain)).toEqual(before.recount.map(plain));
  });

  it('counts a flag-free Wastage as Wastage but not as flagged', () => {
    const s = buildReport(wasted(reportSession(), ITEMS.dupA, '1'), META).summary; // −2 with 1: no flag
    expect(s).toMatchObject({ wastageItems: 1, flaggedWastageItems: 0 });
  });
});

describe('the Excel report with Wastage', () => {
  const without = book(reportSession());
  const withW = book(withWastage());

  it('keeps the same sheets in the same order', () => {
    expect(withW.SheetNames).toEqual(['Summary', 'Variance Detail', 'Recount List']);
  });

  it.each(['Variance Detail', 'Recount List'])('%s: every existing column and cell is unchanged, the new columns come after SKU', (sheet) => {
    const a = grid(without, sheet);
    const b = grid(withW, sheet);
    expect(b.length).toBe(a.length);
    expect(b.map((r) => r.slice(0, EXISTING_COLUMNS))).toEqual(a.map((r) => r.slice(0, EXISTING_COLUMNS)));
    expect(b[0]!.slice(EXISTING_COLUMNS)).toEqual(NEW_HEADERS);
    expect(b[0]!.length).toBe(EXISTING_COLUMNS + NEW_HEADERS.length);
  });

  it('Variance Detail: the Wastage values and the flags are in the Item rows', () => {
    const rows = grid(withW, 'Variance Detail');
    const at = (name: string) => rows.find((r) => r[0] === name)!.slice(EXISTING_COLUMNS);
    expect(at('Sugar')).toEqual([15, 'Expired', null, 'R-1', 0, 'Wastage covers the whole shortage']);
    expect(at('Rice')).toEqual([8, 'Expired', null, 'R-1', 2, 'Wastage is more than the shortage']);
    expect(at('Oil')).toEqual([1, 'Expired', null, 'R-1', 2, 'Wastage on an Item with a surplus']);
    expect(at('Salt')).toEqual([null, null, null, null, 0, null]);
  });

  it('Variance Detail: the existing Flags column still holds only Item flags', () => {
    const rows = grid(withW, 'Variance Detail');
    const flagsColumn = (rows[0] as unknown[]).indexOf('Flags');
    expect(rows.find((r) => r[0] === 'Sugar')![flagsColumn]).toBe('');
    expect(rows.find((r) => r[0] === 'Soap' && String(r[flagsColumn]).includes('Negative'))![flagsColumn]).toBe('Negative System Stock; Duplicate Item');
  });

  it('uses the same unit format as the other quantities', () => {
    const sheet = withW.Sheets['Variance Detail']!;
    expect(sheet['S3']?.z ?? sheet['S2']?.z).toBe('#,##0.000;[Red]-#,##0.000');
    expect(sheet['W2']?.z ?? sheet['W3']?.z).toBe('#,##0.000;[Red]-#,##0.000');
  });

  it('Summary: every existing row is unchanged, and a Wastage block follows the last one', () => {
    const a = grid(without, 'Summary');
    const b = grid(withW, 'Summary');
    expect(b.slice(0, a.length)).toEqual(a);
    const added = b.slice(a.length).map((r) => r.slice(0, 2).filter((c) => c !== null)).filter((r) => r.length > 0);
    expect(added).toEqual([
      ['Wastage'],
      ['Items with Wastage', 3],
      ['Items with a Wastage flag', 3],
      ['Wastage Value (USD)', 36.5],
      ['Unexplained Value (USD)', 7],
    ]);
  });

  it('Summary: the Net Variance Value line is unchanged', () => {
    const find = (b: XLSX.WorkBook) => grid(b, 'Summary').find((r) => r[0] === 'Net Variance Value (USD)');
    expect(find(withW)).toEqual(find(without));
    expect(find(withW)![1]).toBe(-29.5);
  });

  it('keeps the styling: bold headings, frozen header, and a filter over the new columns too', () => {
    const p = parts(withWastage());
    for (const sheet of ['/xl/worksheets/sheet2.xml', '/xl/worksheets/sheet3.xml']) {
      for (const ref of ['A1', 'R1', 'S1', 'X1']) expect(p[sheet]).toMatch(new RegExp(`<c r="${ref}" s="\\d+"`));
      expect(p[sheet]).toContain('<pane ySplit="1"');
    }
    expect(p['/xl/worksheets/sheet2.xml']).toContain('<autoFilter ref="A1:X10"');
    expect(p['/xl/worksheets/sheet1.xml']).toContain('<c r="A57" s="5" t="str"><v>Wastage</v>'); // the new heading is bold like the others
    expect(p['/xl/styles.xml']).toBe(BASELINE['/xl/styles.xml']);
  });
});
