import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { transition } from '../src/domain/adjustments';
import { adjustView } from '../src/domain/adjustView';
import { adjustmentTotals, buildAdjustmentReport } from '../src/domain/adjustmentReport';
import type { Item } from '../src/domain/export';
import { addTally, finishItem, newSession, removeTally, type AdjustmentStatus, type Session } from '../src/domain/session';
import { writeAdjustmentReport } from '../src/domain/workbook';

// T28, ADR 0007: the totals on the Adjust tab and in the Adjustment Report come from one function.
const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, expected: number, cost: number): Item => ({ key, duplicate: null, name: key, variant: '', sku: '', category: '', expected, cost, flags: [] });
const A = item('a', 100_000, 150); // 85 → REMOVE 15 ($22.50)
const B = item('b', 5_000, 200); // 8 → ADD 3 ($6.00)
const C = item('c', 10_000, 175); // 12 → ADD 2 ($3.50)
const D = item('d', 4_000, 100); // 3 → REMOVE 1 ($1.00): Rejected
const E = item('e', 10_000, 100); // 8 → REMOVE 2, Approved, then the count is removed: history only

function session(): Session {
  let s = newSession('e.xlsx', AT, [A, B, C, D, E]);
  for (const [it, n] of [[A, 85_000], [B, 8_000], [C, 12_000], [D, 3_000], [E, 8_000]] as [Item, number][]) s = finishItem(addTally(s, it, n, AT), it, AT);
  const move = (x: Session, it: Item, to: AdjustmentStatus) => {
    const r = transition(x, it, { to, by: 'Mary', note: 'n', at: AT, appliedCheck: true });
    if (!r.ok) throw new Error(r.message);
    return r.session;
  };
  s = move(s, D, 'Rejected');
  s = move(s, E, 'Approved');
  return removeTally(s, E, 0, AT);
}

describe('adjustmentTotals', () => {
  const totals = adjustmentTotals(adjustView(session()).list);

  it('totals ADD and REMOVE in units and value, in integers', () => {
    expect(totals.add).toEqual({ adjustments: 2, units: 5_000, value: 950 }); // B +3 ($6.00), C +2 ($3.50)
    expect(totals.remove).toEqual({ adjustments: 1, units: -15_000, value: -2_250 });
    expect(totals.net).toEqual({ adjustments: 3, units: -10_000, value: -1_300 });
  });

  it('leaves out Rejected rows and history-only rows', () => {
    expect(adjustView(session()).list).toHaveLength(5); // A, B, C, D (Rejected), E (history only)
    expect(totals.net.adjustments).toBe(3);
  });

  it('is what the Adjustment Report says in its summary, to the cent', () => {
    const report = buildAdjustmentReport(session(), { branch: 'b', counter: 'c', generatedAt: AT });
    expect(report.summary.totals).toEqual(totals);
    const book = XLSX.read(writeAdjustmentReport(report), { type: 'array' });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets['Summary']!, { header: 1, defval: null }).map((r) => r.filter((c) => c !== null));
    for (const [label, t] of [['ADD', totals.add], ['REMOVE', totals.remove], ['Net', totals.net]] as const) {
      expect(rows.find((r) => r[0] === label)).toEqual([label, t.adjustments, t.units / 1000, t.value / 100]);
    }
  });

  it('is zero for no Adjustments', () => {
    expect(adjustmentTotals([]).net).toEqual({ adjustments: 0, units: 0, value: 0 });
  });
});
