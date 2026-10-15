import { describe, expect, it } from 'vitest';
import { countProgress, filterCountItems, recentlyCounted, tabCounts } from '../src/domain/countView';
import { addTally, editTally, finishItem, newSession, removeTally, type Session } from '../src/domain/session';
import { ITEMS, reportSession } from './helpers/reportSession';

const AT = '2026-10-06T06:45:00.000Z';
const names = (items: { name: string; variant: string }[]) => items.map((i) => `${i.name} ${i.variant}`.trim());

describe('countProgress', () => {
  it('counts Done Items, like the header, and what is left', () => {
    // reportSession: 9 Items; 7 Done, Tea in progress, Flour uncounted.
    expect(countProgress(reportSession())).toEqual({ counted: 7, total: 9, left: 2, percent: 78 });
  });

  it('is 0% with nothing loaded or counted', () => {
    expect(countProgress(newSession('x.xlsx', AT, []))).toEqual({ counted: 0, total: 0, left: 0, percent: 0 });
    expect(countProgress(newSession('x.xlsx', AT, Object.values(ITEMS))).percent).toBe(0);
  });
});

describe('the Count filters', () => {
  const s = reportSession();

  it('To count: everything not Done, including Items in progress', () => {
    expect(names(filterCountItems(s, 'to-count', '')).sort()).toEqual(['Flour', 'Tea']);
  });

  it('Counted: Done Items', () => {
    expect(filterCountItems(s, 'counted', '')).toHaveLength(7);
  });

  it('Flagged: Done Items that fired Look Again', () => {
    expect(names(filterCountItems(s, 'flagged', ''))).toEqual(['Sugar 2kg', 'Rice 5kg', 'Soap']) // $22.50, $9.00, and 2 of 8 units;
  });

  it('the tab counts match the lists', () => {
    const c = tabCounts(s);
    expect(c).toEqual({ 'to-count': 2, counted: 7, flagged: 3 });
    expect(c['to-count'] + c.counted).toBe(s.items.length);
  });

  it('search works inside the selected tab', () => {
    expect(names(filterCountItems(s, 'counted', 'soap'))).toHaveLength(2);
    expect(filterCountItems(s, 'to-count', 'soap')).toEqual([]);
    expect(names(filterCountItems(s, 'to-count', 'tea'))).toEqual(['Tea']);
  });

  it('without a tab, an empty search lists nothing, a search lists matches from every Item', () => {
    expect(filterCountItems(s, null, '')).toEqual([]);
    expect(filterCountItems(s, null, 'tea')).toHaveLength(1);
  });

  it('an empty search in a tab lists the whole tab, in Export order', () => {
    expect(filterCountItems(s, 'to-count', '').map((i) => i.key)).toEqual([ITEMS.progress.key, ITEMS.uncounted.key]);
  });
});

describe('recentlyCounted', () => {
  const done = (s: Session, it: (typeof ITEMS)[keyof typeof ITEMS], t: number) => finishItem(addTally(s, it, t, AT), it, AT);

  it('lists the last 5 Done Items, newest first', () => {
    const list = recentlyCounted(reportSession());
    expect(list).toHaveLength(5);
    expect(names(list.map((l) => l.item))).toEqual(['Jam', 'Soap', 'Soap', 'Rice 5kg', 'Salt']);
    expect(list[0]).toMatchObject({ count: 1_000 });
  });

  it('puts an Item at the top again when it is counted again after being removed', () => {
    let s = reportSession();
    s = removeTally(s, ITEMS.short, 0, AT);
    s = done(s, ITEMS.short, 80_000);
    expect(recentlyCounted(s)[0]).toMatchObject({ item: { key: ITEMS.short.key }, count: 80_000 });
  });

  it('shows the current total after an edit, and skips Items that are only in progress', () => {
    let s = reportSession();
    s = editTally(s, ITEMS.unreadable, 0, 2_500, AT);
    const list = recentlyCounted(s);
    expect(list[0]).toMatchObject({ count: 2_500 });
    expect(list.some((l) => l.item.key === ITEMS.progress.key)).toBe(false);
  });

  it('is empty with nothing counted', () => {
    expect(recentlyCounted(newSession('x.xlsx', AT, Object.values(ITEMS)))).toEqual([]);
  });
});
