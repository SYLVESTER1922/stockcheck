import { describe, expect, it } from 'vitest';
import type { Item } from '../src/domain/export';
import {
  addTally,
  canReplace,
  editTally,
  finishItem,
  hasCounts,
  isReported,
  markReported,
  newSession,
  removeTally,
} from '../src/domain/session';

const item: Item = {
  key: 'name:sugar|2kg',
  duplicate: null,
  name: 'Sugar',
  variant: '2kg',
  sku: '',
  category: '',
  expected: 10_000,
  cost: 150,
  flags: [],
};
const AT = '2026-10-06T06:45:00.000Z';
const empty = () => newSession('export.xlsx', '2026-10-06T06:30:00.000Z', [item]);
const counted = () => finishItem(addTally(empty(), item, 9_000, AT), item, AT);

// Spec §4.8, ADR 0003: a new Export (or a restore) may only replace a Session that is empty or reported.
describe('reported Session and reload guard', () => {
  it('lets an empty Session be replaced without asking', () => {
    expect(hasCounts(empty())).toBe(false);
    expect(canReplace(empty())).toBe(true);
  });

  it('guards a Session with Counts that has not been reported', () => {
    expect(hasCounts(counted())).toBe(true);
    expect(isReported(counted())).toBe(false);
    expect(canReplace(counted())).toBe(false);
  });

  it('lets a reported Session be replaced', () => {
    const reported = markReported(counted());
    expect(isReported(reported)).toBe(true);
    expect(canReplace(reported)).toBe(true);
  });

  it.each([
    ['adding a Tally', (s: ReturnType<typeof counted>) => addTally(s, item, 1_000, AT)],
    ['editing a Tally', (s: ReturnType<typeof counted>) => editTally(s, item, 0, 8_000, AT)],
    ['removing a Tally', (s: ReturnType<typeof counted>) => removeTally(s, item, 0, AT)],
    ['tapping Done', (s: ReturnType<typeof counted>) => finishItem(addTally(s, item, 1_000, AT), item, AT)],
  ])('makes a reported Session unreported again after %s', (_label, change) => {
    expect(isReported(change(markReported(counted())))).toBe(false);
  });

  it('lets a Session be replaced once every Count has been removed', () => {
    const emptied = removeTally(markReported(counted()), item, 0, AT);
    expect(hasCounts(emptied)).toBe(false);
    expect(canReplace(emptied)).toBe(true);
  });
});
