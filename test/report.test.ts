import { describe, expect, it } from 'vitest';
import type { Item } from '../src/domain/export';
import { buildReport, reportFileName, SHORTAGE_NOTE } from '../src/domain/report';
import { addTally, finishItem, newSession, type Session } from '../src/domain/session';

const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, expected: number | null, cost: number, over: Partial<Item> = {}): Item => ({
  key,
  duplicate: null,
  name: key,
  variant: '',
  sku: '',
  category: 'Grocery',
  expected,
  cost,
  flags: [],
  ...over,
});

const ITEMS = {
  short: item('Short', 10_000, 150), // count 9 → −1, −$1.50
  over: item('Over', 5_000, 200), // count 6 → +1, +$2.00
  match: item('Match', 3_000, 100), // count 3 → 0
  big: item('Big', 10_000, 150), // count 4 → −6, −$9.00: large, Look Again
  resolved: item('Resolved', 10_000, 150), // 4 then 6 after Look Again → 0: ended exactly at Expected
  progress: item('Progress', 8_000, 100), // Another place only
  unreadable: item('Unreadable', null, 100, { flags: ['unreadable-expected'] }),
  uncounted: item('Uncounted', 7_000, 300, { flags: ['negative-system-stock'] }),
};

function countedSession(): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', Object.values(ITEMS));
  const done = (it: Item, ...tallies: number[]) => {
    for (const t of tallies) s = addTally(s, it, t, AT);
    s = finishItem(s, it, AT);
  };
  done(ITEMS.short, 9_000);
  done(ITEMS.over, 6_000);
  done(ITEMS.match, 3_000);
  done(ITEMS.big, 4_000);
  done(ITEMS.resolved, 4_000);
  s = addTally(s, ITEMS.resolved, 6_000, AT);
  s = addTally(s, ITEMS.progress, 2_000, AT);
  done(ITEMS.unreadable, 1_000);
  return s;
}

const META = { branch: 'Main Street', counter: 'Alex', generatedAt: '2026-10-06T07:50:00.000Z' };
const row = (name: string) => buildReport(countedSession(), META).detail.find((r) => r.name === name)!;

describe('buildReport: Variance Detail', () => {
  it('gives every Item a status', () => {
    const statuses = Object.fromEntries(buildReport(countedSession(), META).detail.map((r) => [r.name, r.status]));
    expect(statuses).toEqual({
      Short: 'SHORT',
      Over: 'OVER',
      Match: 'MATCH',
      Big: 'SHORT',
      Resolved: 'MATCH',
      Progress: 'IN PROGRESS',
      Unreadable: 'EXPECTED UNREADABLE',
      Uncounted: 'NOT COUNTED',
    });
  });

  it('shows the Count but no Variance for an in-progress Item', () => {
    expect(row('Progress')).toMatchObject({ count: 2_000, variance: null, value: null });
  });

  it('leaves Count, Variance and Value blank for an Uncounted Item, never 0', () => {
    expect(row('Uncounted')).toMatchObject({ count: null, variance: null, value: null });
  });

  it('carries the Session start on every row and the Count at Look Again where it fired', () => {
    expect(row('Big')).toMatchObject({ sessionStart: '2026-10-06T06:30:00.000Z', countAtLookAgain: 4_000 });
    expect(row('Short').countAtLookAgain).toBeNull();
  });

  it('carries the Count at Done: the blind count, kept after later Tallies', () => {
    expect(row('Resolved')).toMatchObject({ countAtDone: 4_000, count: 10_000 });
    expect(row('Short').countAtDone).toBe(9_000);
    expect(row('Progress').countAtDone).toBeNull();
    expect(row('Uncounted').countAtDone).toBeNull();
  });

  it('flags Items that prompted and ended exactly at Expected, and other Item flags', () => {
    expect(row('Resolved').flags).toEqual(['Ended exactly at Expected']);
    expect(row('Uncounted').flags).toEqual(['Negative System Stock']);
    expect(row('Progress').flags).toEqual(['In progress: Done not tapped']);
  });

  it('sorts by absolute Variance Value, largest first, with in-progress and Uncounted Items last (T15)', () => {
    expect(buildReport(countedSession(), META).detail.map((r) => r.name)).toEqual([
      'Big',
      'Over',
      'Short',
      'Match',
      'Resolved',
      'Unreadable',
      'Progress',
      'Uncounted',
    ]);
  });
});

describe('buildReport: Summary', () => {
  const summary = buildReport(countedSession(), META).summary;

  it('counts Items by state', () => {
    expect(summary).toMatchObject({ items: 8, finished: 6, inProgress: 1, uncounted: 1, matching: 2, short: 2, over: 1 });
  });

  it('totals units and money over finished Items only', () => {
    expect(summary).toMatchObject({
      unitsShort: -7_000,
      unitsOver: 1_000,
      shortageValue: -1_050,
      surplusValue: 200,
      netValue: -850,
    });
  });

  it('has a headline equal to the sum of the line values, to the cent', () => {
    const report = buildReport(countedSession(), META);
    const sum = report.detail.reduce((total, r) => total + (r.value ?? 0), 0);
    expect(sum).toBe(report.summary.netValue);
  });

  it('reports prompts and the Recount List size', () => {
    expect(summary).toMatchObject({ promptedItems: 2, recountItems: 1 });
  });

  it('records the Session times, names, warnings and the shortage note', () => {
    expect(summary).toMatchObject({
      branch: 'Main Street',
      counter: 'Alex',
      exportFileName: 'export.xlsx',
      sessionStart: '2026-10-06T06:30:00.000Z',
      countingFinished: AT,
      generatedAt: META.generatedAt,
      note: SHORTAGE_NOTE,
    });
    expect(summary.warnings).toEqual([
      '1 item has an unreadable Expected, so no Variance.',
      '1 item has Negative System Stock.',
      '1 item is In progress (Done not tapped), so it shows no Variance and is not in the totals.',
    ]);
  });
});

describe('buildReport: Recount List', () => {
  it('lists finished Items with a large Variance only', () => {
    expect(buildReport(countedSession(), META).recount.map((r) => r.name)).toEqual(['Big']);
  });
});

describe('reportFileName', () => {
  it('includes branch, counter, date and time, slugified', () => {
    expect(reportFileName('Main Street', 'Alex M.', new Date(2026, 9, 6, 7, 5))).toBe(
      'stockcheck-main-street-alex-m-2026-10-06-0705.xlsx',
    );
  });
});

describe('buildReport: T15 detail fields', () => {
  it('carries the Item Key, whether Look Again was prompted, and whether it ended exactly at Expected', () => {
    expect(row('Big')).toMatchObject({ key: 'Big', lookAgainPrompted: true, endedAtExpected: false });
    expect(row('Resolved')).toMatchObject({ lookAgainPrompted: true, endedAtExpected: true });
    expect(row('Short')).toMatchObject({ lookAgainPrompted: false, endedAtExpected: false });
  });
});

describe('buildReport: T15 Summary figures', () => {
  const summary = buildReport(countedSession(), META).summary;

  it('gives the share of Items counted', () => {
    expect(summary.percentCounted).toBeCloseTo(6 / 8);
  });

  it('values the Expected stock of counted Items at cost, and net Variance as a share of it', () => {
    // Short 10×$1.50 + Over 5×$2 + Match 3×$1 + Big 10×$1.50 + Resolved 10×$1.50; Unreadable has no Expected.
    expect(summary.expectedValueCounted).toBe(5_800);
    expect(summary.netPercentOfExpected).toBeCloseTo(-850 / 5_800);
  });

  it('has no percentage when the counted Expected value is zero', () => {
    const empty = buildReport(newSession('e.xlsx', AT, [ITEMS.short]), META).summary;
    expect(empty.netPercentOfExpected).toBeNull();
  });

  it('lists the top shortages and overages by $ value', () => {
    expect(summary.topShortages.map((r) => r.name)).toEqual(['Big', 'Short']);
    expect(summary.topOverages.map((r) => r.name)).toEqual(['Over']);
  });

  it('caps each top list at 10', () => {
    const many = Array.from({ length: 12 }, (_, i) => item(`S${i}`, 10_000, 100 + i));
    let s = newSession('e.xlsx', AT, many);
    for (const it of many) s = finishItem(addTally(s, it, 5_000, AT), it, AT);
    const top = buildReport(s, META).summary.topShortages;
    expect(top).toHaveLength(10);
    expect(top[0]!.name).toBe('S11'); // highest cost, so the biggest $ shortage
  });

  it('totals Variance by Category over counted Items, worst first', () => {
    const a = item('A', 10_000, 100, { category: 'Drinks' });
    const b = item('B', 10_000, 100, { category: 'Grocery' });
    const c = item('C', 10_000, 100, { category: 'Grocery' });
    const d = item('D', 10_000, 100, { category: '' });
    let s = newSession('e.xlsx', AT, [a, b, c, d]);
    for (const [it, n] of [[a, 12_000], [b, 7_000], [c, 9_000]] as const) s = finishItem(addTally(s, it, n, AT), it, AT);
    expect(buildReport(s, META).summary.byCategory).toEqual([
      { category: 'Grocery', counted: 2, units: -4_000, value: -400 },
      { category: 'Drinks', counted: 1, units: 2_000, value: 200 },
    ]);
  });
});

