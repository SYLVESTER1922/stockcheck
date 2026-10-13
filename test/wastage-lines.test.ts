import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { buildReport } from '../src/domain/report';
import { setWastage } from '../src/domain/session';
import { varianceView } from '../src/domain/varianceView';
import { parseWastage } from '../src/domain/wastage';
import { writeReport } from '../src/domain/workbook';
import { AT, ITEMS, META, reportSession } from './helpers/reportSession';

// T28, ADR 0007: the Variance tab and the Report screen show Wastage Value and Unexplained Value as new lines,
// from the same figures as the Session Report, and only when there is Wastage. Net Variance Value never changes.
const wasted = (s: ReturnType<typeof reportSession>, item: (typeof ITEMS)[keyof typeof ITEMS], quantity: string) => {
  const r = parseWastage({ quantity, reason: 'Expired', note: '', register: 'R-1', confirmed: true }, AT);
  if (!r.ok) throw new Error(r.message);
  return setWastage(s, item, r.entry);
};
/** Sugar −15 with Wastage 15, Rice −6 with 8, Oil +1 with 1 (the T21 scenario): Wastage $36.50, Unexplained $7.00. */
const withWastage = () => wasted(wasted(wasted(reportSession(), ITEMS.short, '15'), ITEMS.big, '8'), ITEMS.over, '1');

describe('the Variance tab lines', () => {
  it('are not there when the Session has no Wastage, so the tab is exactly as before', () => {
    expect(varianceView(buildReport(reportSession(), META)).wastage).toBeNull();
  });

  it('show the item count, Wastage Value and Unexplained Value from the report', () => {
    const view = varianceView(buildReport(withWastage(), META));
    expect(view.wastage).toEqual({ items: 3, value: 3_650, unexplained: 700 });
  });

  it('leave the Net Variance Value, shortage and surplus exactly as they were', () => {
    const before = varianceView(buildReport(reportSession(), META));
    const after = varianceView(buildReport(withWastage(), META));
    expect(after.hero).toEqual(before.hero);
    expect(after.tiles).toEqual(before.tiles);
    expect(after.hero.net).toBe(-2_950);
  });

  it('equal the Session Report Summary lines to the cent', () => {
    const report = buildReport(withWastage(), META);
    const book = XLSX.read(writeReport(report), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets['Summary']!, { header: 1, defval: null }).map((r) => r.filter((c) => c !== null));
    const line = (label: string) => rows.find((r) => r[0] === label)![1] as number;
    const view = varianceView(report);
    expect(Math.round(line('Wastage Value (USD)') * 100)).toBe(view.wastage!.value);
    expect(Math.round(line('Unexplained Value (USD)') * 100)).toBe(view.wastage!.unexplained);
    expect(Math.round(line('Net Variance Value (USD)') * 100)).toBe(view.hero.net);
    expect(view.hero.net + view.wastage!.value).toBe(view.wastage!.unexplained); // Net + Wastage = Unexplained
  });
});
