import { describe, expect, it } from 'vitest';
import { transition } from '../src/domain/adjustments';
import { toBackup } from '../src/domain/backup';
import { buildAdjustmentReport } from '../src/domain/adjustmentReport';
import type { Item } from '../src/domain/export';
import { buildReport } from '../src/domain/report';
import { addTally, finishItem, newSession, setWastage, type Session } from '../src/domain/session';
import { parseWastage } from '../src/domain/wastage';
import { writeAdjustmentReport, writeReport } from '../src/domain/workbook';

// T28: sizes and times for a big stocktake. A phone's localStorage holds about 5 MB; the Session must stay far under it.
const AT = '2026-10-06T06:45:00.000Z';
const items: Item[] = Array.from({ length: 1000 }, (_, i) => ({
  key: `name:item ${i}|1kg`, duplicate: null, name: `Sample Item ${i}`, variant: '1kg', sku: i % 3 === 0 ? `SKU${i}` : '', category: 'Grocery', expected: 12_000, cost: 199 + (i % 50), flags: [],
}));

function bigSession(): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', items);
  items.forEach((it, i) => {
    s = finishItem(addTally(s, it, 12_000 - 1_000 * (1 + (i % 4)), AT), it, AT); // every Item short by 1 to 4
  });
  const w = parseWastage({ quantity: '1', reason: 'Expired', note: 'Past its date', register: 'R-100', confirmed: true }, AT);
  if (!w.ok) throw new Error(w.message);
  for (const it of items.slice(0, 100)) s = setWastage(s, it, w.entry); // Wastage on 100 Items
  for (const it of items.slice(0, 300)) {
    const a = transition(s, it, { to: 'Approved', by: 'Mary Moyo', note: 'Agreed with the branch manager', at: AT });
    if (!a.ok) throw new Error(a.message);
    s = a.session;
  }
  for (const it of items.slice(0, 150)) {
    const a = transition(s, it, { to: 'Applied', by: 'Joe Dube', note: '', at: AT, appliedCheck: true });
    if (!a.ok) throw new Error(a.message);
    s = a.session;
  }
  return s;
}

describe('a 1,000-Item stocktake with Wastage on 100 Items and 300 Approvals (150 Applied)', () => {
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  const timed = <T,>(f: () => T): [T, number] => {
    const t = performance.now();
    const v = f();
    return [v, performance.now() - t];
  };

  it('keeps the saved Session, the backup and both Excel files small, and builds them quickly', () => {
    const s = bigSession();
    const plain = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', items);
    const session = new TextEncoder().encode(JSON.stringify(s)).length;
    const backup = new TextEncoder().encode(toBackup(s, { savedAt: AT })).length;
    const [sessionReport, tSession] = timed(() => writeReport(buildReport(s, { branch: 'Main Street', counter: 'Alex', generatedAt: AT })));
    const [adjustmentReport, tAdjust] = timed(() => writeAdjustmentReport(buildAdjustmentReport(s, { branch: 'Main Street', counter: 'Alex', generatedAt: AT })));
    const before = new TextEncoder().encode(JSON.stringify({ ...plain, tallies: s.tallies, finished: s.finished, countAtDone: s.countAtDone })).length;
    console.log(
      `[size] 1,000 Items: saved Session ${kb(session)} (${kb(before)} for the same Counts without Wastage or Adjustments), backup ${kb(backup)}, ` +
        `Session Report ${kb(sessionReport.byteLength)} in ${tSession.toFixed(0)} ms, Adjustment Report ${kb(adjustmentReport.byteLength)} in ${tAdjust.toFixed(0)} ms`,
    );
    expect(session).toBeLessThan(1024 * 1024); // far under localStorage's ~5 MB
    expect(backup).toBeLessThan(1024 * 1024);
    expect(sessionReport.byteLength).toBeLessThan(2 * 1024 * 1024);
    expect(adjustmentReport.byteLength).toBeLessThan(2 * 1024 * 1024);
    expect(tAdjust).toBeLessThan(3_000);
  });
});
