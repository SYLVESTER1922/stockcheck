import { describe, expect, it } from 'vitest';
import { deriveAdjustments, transition } from '../src/domain/adjustments';
import {
  adjustView,
  FILTERS,
  filterAdjustments,
  leftOutLine,
  matchingLine,
  statusCounts,
} from '../src/domain/adjustView';
import type { Item } from '../src/domain/export';
import { formatLocalTime } from '../src/domain/format';
import { addTally, editTally, finishItem, newSession, type Session } from '../src/domain/session';

// T23, ADR 0007: the Adjust tab's list. The rules for which Items appear are T22's.
const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, name: string, expected: number | null, cost: number, over: Partial<Item> = {}): Item => ({
  key,
  duplicate: null,
  name,
  variant: '',
  sku: '',
  category: '',
  expected,
  cost,
  flags: [],
  ...over,
});

const I = {
  sugar: item('sku:S1', 'Sugar', 100_000, 150, { variant: '2kg', sku: 'S1' }), // −15 REMOVE, −$22.50
  oil: item('sku:O1', 'Cooking Oil', 5_000, 200, { variant: '2L', sku: 'O1' }), // +3 ADD, +$6.00
  soap: item('name:soap|', 'Soap', -5_000, 100, { flags: ['negative-system-stock'] }), // +5 ADD, +$5.00
  rice: item('name:rice|#1', 'Rice', 10_000, 150, { duplicate: 1 }), // −1 REMOVE, −$1.50
  salt: item('name:salt|', 'Salt', 3_000, 100), // match
  jam: item('name:jam|', 'Jam', 8_000, 100), // in progress
  honey: item('name:honey|', 'Honey', 2_000, 100), // Uncounted
  tea: item('name:tea|', 'Tea', null, 100, { flags: ['unreadable-expected'] }), // unreadable
};

function session(): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', Object.values(I));
  const done = (it: Item, t: number) => {
    s = finishItem(addTally(s, it, t, AT), it, AT);
  };
  done(I.sugar, 85_000);
  done(I.oil, 8_000);
  done(I.soap, 0);
  done(I.rice, 9_000);
  done(I.salt, 3_000);
  done(I.tea, 1_000);
  s = addTally(s, I.jam, 2_000, AT);
  return s;
}
const names = (s: Session, filter: Parameters<typeof filterAdjustments>[1] = 'All', query = '') =>
  filterAdjustments(adjustView(s).list, filter, query).map((a) => a.item.name);
const approve = (s: Session, it: Item) => {
  const r = transition(s, it, { to: 'Approved', by: 'Mary', at: AT });
  if (!r.ok) throw new Error(r.message);
  return r.session;
};

describe('the list', () => {
  it('shows every Adjustment, largest value first, then by name', () => {
    expect(names(session())).toEqual(['Sugar', 'Cooking Oil', 'Soap', 'Rice']); // $22.50, $6.00, $5.00, $1.50
  });

  it('puts an Applied Adjustment that needs a review first, whatever its value', () => {
    const apply = (x: Session, it: Item) => {
      const approved = transition(x, it, { to: 'Approved', by: 'Mary', at: AT });
      if (!approved.ok) throw new Error(approved.message);
      const applied = transition(approved.session, it, { to: 'Applied', by: 'Joe', at: AT, appliedCheck: true });
      if (!applied.ok) throw new Error(applied.message);
      return applied.session;
    };
    // Rice has the smallest value ($1.50). It is applied, and then its Count changes.
    const s = editTally(apply(session(), I.rice), I.rice, 0, 7_000, AT);
    const list = adjustView(s).list;
    expect(list[0]!.item.name).toBe('Rice');
    expect(list[0]!.review).not.toBeNull();
    expect(list.slice(1).map((a) => a.item.name)).toEqual(['Sugar', 'Cooking Oil', 'Soap']);
  });

  it('breaks ties by name and does not hide Items whose cost is $0', () => {
    let s = newSession('e.xlsx', AT, [item('name:b|', 'B', 1_000, 0), item('name:a|', 'A', 1_000, 0), item('name:c|', 'C', 1_000, 100)]);
    for (const it of s.items) s = finishItem(addTally(s, it, 3_000, AT), it, AT);
    expect(names(s)).toEqual(['C', 'A', 'B']);
  });

  it('is not capped at 20', () => {
    const many = Array.from({ length: 45 }, (_, i) => item(`name:i${i}|`, `Item ${i}`, 1_000, 100));
    let s = newSession('e.xlsx', AT, many);
    for (const it of many) s = finishItem(addTally(s, it, 2_000, AT), it, AT);
    expect(adjustView(s).list).toHaveLength(45);
  });

  it('carries what T22 derives, so the screen cannot disagree with it', () => {
    expect(adjustView(session()).list.map((a) => a.id).sort()).toEqual(deriveAdjustments(session()).list.map((a) => a.id).sort());
  });
});

describe('status filter', () => {
  it('has All, Pending, Approved, Applied, Rejected and Held', () => {
    expect(FILTERS).toEqual(['All', 'Pending', 'Approved', 'Applied', 'Rejected', 'Held']);
  });

  it('counts by the status shown: an ADD with no Supplier Document is Held', () => {
    expect(statusCounts(adjustView(session()).list)).toEqual({ All: 4, Pending: 2, Approved: 0, Applied: 0, Rejected: 0, Held: 2 });
  });

  it('follows a decision', () => {
    const s = approve(session(), I.sugar);
    expect(statusCounts(adjustView(s).list)).toMatchObject({ All: 4, Pending: 1, Approved: 1, Held: 2 });
    expect(names(s, 'Approved')).toEqual(['Sugar']);
    expect(names(s, 'Pending')).toEqual(['Rice']);
    expect(names(s, 'Held')).toEqual(['Cooking Oil', 'Soap']);
    expect(names(s, 'Applied')).toEqual([]);
  });
});

describe('search', () => {
  it('finds by name, Variant or SKU, ignoring case and spacing', () => {
    expect(names(session(), 'All', 'SUGAR')).toEqual(['Sugar']);
    expect(names(session(), 'All', 'oil 2 l')).toEqual(['Cooking Oil']);
    expect(names(session(), 'All', '2L')).toEqual(['Cooking Oil']);
    expect(names(session(), 'All', 's1')).toEqual(['Sugar']);
    expect(names(session(), 'All', 'o1')).toEqual(['Cooking Oil']);
  });

  it('needs every word to match', () => {
    expect(names(session(), 'All', 'cooking oil')).toEqual(['Cooking Oil']);
    expect(names(session(), 'All', 'cooking sugar')).toEqual([]);
  });

  it('an empty search shows everything, and a near miss shows nothing', () => {
    expect(names(session(), 'All', '   ')).toHaveLength(4);
    expect(names(session(), 'All', 'sugr')).toEqual([]);
  });

  it('combines with the status filter', () => {
    const s = approve(session(), I.sugar);
    expect(names(s, 'Approved', 'sugar')).toEqual(['Sugar']);
    expect(names(s, 'Held', 'sugar')).toEqual([]);
  });
});

describe('the lines about what is left out', () => {
  it('says how many Items are not in the list, and why', () => {
    expect(leftOutLine(adjustView(session()).leftOut)).toBe('3 Items are not here yet: 1 not counted, 1 in progress, 1 with an unreadable Expected.');
  });

  it('uses the singular, and drops what is zero', () => {
    expect(leftOutLine({ uncounted: 1, inProgress: 0, expectedUnreadable: 0 })).toBe('1 Item is not here yet: 1 not counted.');
    expect(leftOutLine({ uncounted: 0, inProgress: 2, expectedUnreadable: 0 })).toBe('2 Items are not here yet: 2 in progress.');
  });

  it('says nothing when nothing is left out', () => {
    expect(leftOutLine({ uncounted: 0, inProgress: 0, expectedUnreadable: 0 })).toBeNull();
  });

  it('says how many Done Items match Expected, so need no Adjustment', () => {
    expect(matchingLine(1)).toBe('1 counted Item matches Expected, so needs no Adjustment.');
    expect(matchingLine(3)).toBe('3 counted Items match Expected, so need no Adjustment.');
    expect(matchingLine(0)).toBeNull();
  });
});

describe('the Export date', () => {
  it('is shown in the phone\'s local time, to the minute', () => {
    expect(formatLocalTime(new Date(2026, 9, 6, 7, 5, 30).toISOString())).toBe('2026-10-06 07:05');
  });
});

describe('a large Session', () => {
  it('derives, sorts, counts and filters 1,000 Items quickly', () => {
    const many = Array.from({ length: 1_000 }, (_, i) => item(`name:i${i}|`, `Item ${i}`, 10_000, 100 + (i % 50)));
    let s = newSession('e.xlsx', AT, many);
    for (const [i, it] of many.entries()) s = finishItem(addTally(s, it, i % 7 === 0 ? 10_000 : 7_000 + (i % 5) * 1_000, AT), it, AT);
    const start = performance.now();
    const view = adjustView(s);
    const counts = statusCounts(view.list);
    const found = filterAdjustments(view.list, 'Pending', 'item 99');
    const ms = performance.now() - start;
    console.log(`[T23] 1,000 Items: ${view.list.length} Adjustments, derive + sort + count + filter in ${ms.toFixed(1)} ms`);
    expect(counts.All).toBe(view.list.length);
    expect(found.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(500);
  });
});
