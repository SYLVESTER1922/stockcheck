import { describe, expect, it } from 'vitest';
import type { Item } from '../src/domain/export';
import { buildReport } from '../src/domain/report';
import { addTally, finishItem, newSession, type Session } from '../src/domain/session';
import { biggestGaps, varianceView } from '../src/domain/varianceView';

const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, expected: number | null, cost: number): Item => ({
  key, duplicate: null, name: key, variant: '', sku: '', category: 'Grocery', expected, cost, flags: [],
});
const I = {
  bigShort: item('BigShort', 10_000, 300), // 4 → −6 units, −$18.00 (Look Again)
  smallShort: item('SmallShort', 20_000, 100), // 19 → −1, −$1.00
  over: item('Over', 5_000, 200), // 8 → +3, +$6.00 (Look Again)
  manyUnits: item('ManyUnits', 100_000, 5), // 90 → −10 units, −$0.50
  match: item('Match', 3_000, 100), // 3 → 0
  progress: item('Progress', 8_000, 900), // Another place only
  unreadable: item('Unreadable', null, 100),
  uncounted: item('Uncounted', 7_000, 300),
};

function session(): Session {
  let s = newSession('e.xlsx', '2026-10-06T06:30:00.000Z', Object.values(I));
  const done = (it: Item, n: number) => (s = finishItem(addTally(s, it, n, AT), it, AT));
  done(I.bigShort, 4_000);
  done(I.smallShort, 19_000);
  done(I.over, 8_000);
  done(I.manyUnits, 90_000);
  done(I.match, 3_000);
  s = addTally(s, I.progress, 2_000, AT);
  done(I.unreadable, 1_000);
  return s;
}
const report = () => buildReport(session(), { branch: '', counter: '', generatedAt: AT });

describe('varianceView: every figure comes from the Summary', () => {
  it('copies the hero and tiles straight from buildReport', () => {
    const r = report();
    const view = varianceView(r);
    expect(view.hero).toEqual({
      net: r.summary.netValue,
      short: r.summary.shortageValue,
      over: r.summary.surplusValue,
      expectedValueCounted: r.summary.expectedValueCounted,
    });
    expect(view.tiles).toEqual({
      short: { lines: r.summary.short, units: r.summary.unitsShort },
      over: { lines: r.summary.over, units: r.summary.unitsOver },
      match: r.summary.matching,
      notCounted: r.summary.uncounted,
    });
    expect(view.inProgress).toBe(1);
    expect(view.note).toBe(r.summary.note);
  });

  it('has the expected numbers for this Session (only Done Items count)', () => {
    expect(varianceView(report()).hero).toEqual({ net: -1_350, short: -1_950, over: 600, expectedValueCounted: 6_800 });
    expect(varianceView(report()).tiles).toEqual({
      short: { lines: 3, units: -17_000 },
      over: { lines: 1, units: 3_000 },
      match: 1,
      notCounted: 1,
    });
  });
});

describe('biggestGaps', () => {
  it('lists Done Items with a Variance, largest $ first', () => {
    expect(biggestGaps(report(), 'value').map((g) => g.name)).toEqual(['BigShort', 'Over', 'SmallShort', 'ManyUnits']);
  });

  it('can rank by units instead', () => {
    expect(biggestGaps(report(), 'units').map((g) => g.name)).toEqual(['ManyUnits', 'BigShort', 'Over', 'SmallShort']);
  });

  it('never includes in-progress, Uncounted, unreadable or exactly matching Items', () => {
    const names = biggestGaps(report(), 'value').map((g) => g.name);
    for (const hidden of ['Progress', 'Uncounted', 'Unreadable', 'Match']) expect(names).not.toContain(hidden);
  });

  it('scales bars to the largest gap in the chosen ranking', () => {
    const byValue = biggestGaps(report(), 'value');
    expect(byValue[0]!.fraction).toBe(1);
    expect(byValue[1]!.fraction).toBeCloseTo(600 / 1_800);
    const byUnits = biggestGaps(report(), 'units');
    expect(byUnits[1]!.fraction).toBeCloseTo(6_000 / 10_000);
  });

  it('carries what a row shows and what tapping it reveals', () => {
    expect(biggestGaps(report(), 'value')[0]).toMatchObject({
      key: 'BigShort',
      expected: 10_000,
      count: 4_000,
      cost: 300,
      variance: -6_000,
      value: -1_800,
      direction: 'short',
      countAtDone: 4_000,
      countAtLookAgain: 4_000,
    });
    expect(biggestGaps(report(), 'value')[2]).toMatchObject({ name: 'SmallShort', countAtLookAgain: null });
  });

  it('shows at most 20 rows', () => {
    const many = Array.from({ length: 25 }, (_, i) => item(`S${i}`, 10_000, 100));
    let s = newSession('e.xlsx', AT, many);
    for (const it of many) s = finishItem(addTally(s, it, 5_000, AT), it, AT);
    expect(biggestGaps(buildReport(s, { branch: '', counter: '', generatedAt: AT }), 'value')).toHaveLength(20);
  });
});
