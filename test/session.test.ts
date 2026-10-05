import { describe, expect, it } from 'vitest';
import { addTally, lineFor, newSession } from '../src/domain/session';
import type { Item } from '../src/domain/export';

const item = (over: Partial<Item> = {}): Item => ({
  key: 'name:sugar|2kg',
  duplicate: null,
  name: 'Sugar',
  variant: '2kg',
  sku: '',
  category: '',
  expected: 10_000,
  cost: 150,
  flags: [],
  ...over,
});

describe('Session', () => {
  it('starts with no Tallies, so every Item is Uncounted', () => {
    const session = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', [item()]);
    expect(lineFor(session, item())).toEqual({ counted: false });
  });

  it('derives Count, Variance and Variance Value from the Tallies', () => {
    const session = addTally(newSession('export.xlsx', '2026-10-06T06:30:00.000Z', [item()]), item().key, 8_000);
    expect(lineFor(session, item())).toEqual({ counted: true, tallies: [8_000], count: 8_000, variance: -2_000, value: -300 });
  });

  it('adds a second entry as another Tally, never replacing the first', () => {
    let session = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', [item()]);
    session = addTally(session, item().key, 4_000);
    session = addTally(session, item().key, 6_000);
    expect(lineFor(session, item())).toMatchObject({ tallies: [4_000, 6_000], count: 10_000, variance: 0, value: 0 });
  });

  it('treats a Count of 0 as counted, not Uncounted', () => {
    const session = addTally(newSession('e.xlsx', '2026-10-06T06:30:00.000Z', [item()]), item().key, 0);
    expect(lineFor(session, item())).toMatchObject({ counted: true, count: 0, variance: -10_000 });
  });

  it('has no Variance when Expected was unreadable', () => {
    const unreadable = item({ expected: null });
    const session = addTally(newSession('e.xlsx', '2026-10-06T06:30:00.000Z', [unreadable]), unreadable.key, 5_000);
    expect(lineFor(session, unreadable)).toEqual({ counted: true, tallies: [5_000], count: 5_000, variance: null, value: null });
  });

  it('never changes the Session it was given', () => {
    const before = newSession('e.xlsx', '2026-10-06T06:30:00.000Z', [item()]);
    addTally(before, item().key, 1_000);
    expect(before.tallies).toEqual({});
  });
});
