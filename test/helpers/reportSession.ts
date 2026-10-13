import type { Item } from '../../src/domain/export';
import { addTally, finishItem, newSession, type Session } from '../../src/domain/session';

/** A fixed synthetic Session that touches every kind of report row. No client data. */
export const AT = '2026-10-06T06:45:00.000Z';
export const META = { branch: 'Main Street', counter: 'Alex', generatedAt: '2026-10-06T07:50:00.000Z' };

const item = (key: string, expected: number | null, cost: number, over: Partial<Item> = {}): Item => ({
  key,
  duplicate: null,
  name: key.replace(/^[a-z]+:/, ''),
  variant: '',
  sku: '',
  category: 'Grocery',
  expected,
  cost,
  flags: [],
  ...over,
});

export const ITEMS = {
  short: item('sku:S1', 100_000, 150, { name: 'Sugar', variant: '2kg', sku: 'S1' }), // count 85 → −15
  over: item('sku:O1', 5_000, 200, { name: 'Oil', sku: 'O1', category: 'Cooking' }), // count 6 → +1
  match: item('name:salt|', 3_000, 100, { name: 'Salt' }), // no SKU, count 3 → 0
  big: item('name:rice|5kg', 10_000, 150, { name: 'Rice', variant: '5kg' }), // count 4 → −6, Look Again
  dupA: item('name:soap|#1', 8_000, 45, { name: 'Soap', duplicate: 1, flags: ['negative-system-stock'] }),
  dupB: item('name:soap|#2', 8_000, 60, { name: 'Soap', duplicate: 2 }),
  progress: item('name:tea|', 8_000, 100, { name: 'Tea' }), // Another place only
  unreadable: item('name:jam|', null, 100, { name: 'Jam', flags: ['unreadable-expected'] }),
  uncounted: item('name:flour|', 7_000, 300, { name: 'Flour' }),
};

/** Done Items: Sugar −15, Oil +1, Salt 0, Rice −6, Soap #1 −2, Soap #2 +1.5; Tea in progress; Jam unreadable. */
export function reportSession(): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', Object.values(ITEMS));
  const done = (it: Item, ...tallies: number[]) => {
    for (const t of tallies) s = addTally(s, it, t, AT);
    s = finishItem(s, it, AT);
  };
  done(ITEMS.short, 85_000);
  done(ITEMS.over, 6_000);
  done(ITEMS.match, 3_000);
  done(ITEMS.big, 4_000);
  done(ITEMS.dupA, 6_000);
  done(ITEMS.dupB, 9_500);
  s = addTally(s, ITEMS.progress, 2_000, AT);
  done(ITEMS.unreadable, 1_000);
  return s;
}
