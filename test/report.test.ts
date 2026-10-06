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

  it('sorts by Variance Value, biggest loss first, with in-progress and Uncounted Items last', () => {
    expect(buildReport(countedSession(), META).detail.map((r) => r.name)).toEqual([
      'Big',
      'Short',
      'Match',
      'Resolved',
      'Over',
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
