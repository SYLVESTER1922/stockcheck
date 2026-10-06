import { describe, expect, it } from 'vitest';
import type { Item } from '../src/domain/export';
import { addTally, editTally, finishItem, lineFor, newSession, removeTally } from '../src/domain/session';

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
const AT = '2026-10-06T06:45:00.000Z';
const start = (it = item()) => newSession('export.xlsx', '2026-10-06T06:30:00.000Z', [it]);
const done = (thousandths: number, it = item()) => finishItem(addTally(start(it), it, thousandths, AT), it, AT);

describe('Session', () => {
  it('starts with every Item Uncounted', () => {
    expect(lineFor(start(), item())).toEqual({ status: 'uncounted' });
  });

  it('keeps an Item in progress, with Expected hidden, until Done', () => {
    const session = addTally(start(), item(), 4_000, AT);
    expect(lineFor(session, item())).toEqual({ status: 'in-progress', tallies: [4_000], count: 4_000 });
  });

  it('reveals Variance and Variance Value once the Item is Done', () => {
    expect(lineFor(done(9_000), item())).toEqual({
      status: 'finished',
      tallies: [9_000],
      count: 9_000,
      variance: -1_000,
      value: -150,
      lookAgain: null,
      countAtLookAgain: null,
    });
  });

  it('adds every entry as another Tally, never replacing one', () => {
    const session = finishItem(addTally(addTally(start(), item(), 4_000, AT), item(), 6_000, AT), item(), AT);
    expect(lineFor(session, item())).toMatchObject({ tallies: [4_000, 6_000], count: 10_000, variance: 0 });
  });

  it('treats a Count of 0 as counted', () => {
    expect(lineFor(done(0), item())).toMatchObject({ status: 'finished', count: 0, variance: -10_000 });
  });

  it('has no Variance and never Looks Again when Expected was unreadable', () => {
    const unreadable = item({ expected: null });
    expect(lineFor(done(50_000, unreadable), unreadable)).toMatchObject({ variance: null, value: null, lookAgain: null });
  });

  describe('Look Again', () => {
    it('asks to check other places for a large shortage, recording the Count at that moment', () => {
      expect(lineFor(done(4_000), item())).toMatchObject({ lookAgain: 'shortage', countAtLookAgain: 4_000 });
    });

    it('suggests an unbooked delivery for a large surplus', () => {
      expect(lineFor(done(16_000), item())).toMatchObject({ lookAgain: 'surplus' });
    });

    it('does not fire before Done', () => {
      expect(addTally(start(), item(), 1_000, AT).countAtLookAgain).toEqual({});
    });

    it('clears the note when looking again resolves it, keeping the Count at Look Again', () => {
      const session = addTally(done(4_000), item(), 6_000, AT);
      expect(lineFor(session, item())).toMatchObject({ count: 10_000, lookAgain: null, countAtLookAgain: 4_000 });
    });

    it('fires when an edit after Done makes the Variance large', () => {
      const session = editTally(done(10_000), item(), 0, 5_000, AT);
      expect(lineFor(session, item())).toMatchObject({ lookAgain: 'shortage', countAtLookAgain: 5_000 });
    });

    it('never overwrites the first Count at Look Again', () => {
      const session = editTally(done(4_000), item(), 0, 3_000, AT);
      expect(lineFor(session, item())).toMatchObject({ countAtLookAgain: 4_000 });
    });
  });

  describe('Count at Done', () => {
    it('records the total when Done is first tapped, before Expected is revealed', () => {
      const session = finishItem(addTally(addTally(start(), item(), 4_000, AT), item(), 5_000, AT), item(), AT);
      expect(session.countAtDone).toEqual({ [item().key]: 9_000 });
    });

    it('is not recorded while the Item is in progress', () => {
      expect(addTally(start(), item(), 4_000, AT).countAtDone).toEqual({});
    });

    it('is kept when a Tally is edited or added after Done', () => {
      const session = addTally(editTally(done(9_000), item(), 0, 7_000, AT), item(), 1_000, AT);
      expect(session.countAtDone).toEqual({ [item().key]: 9_000 });
    });

    it('is kept even if every Tally is removed and the Item is Done again', () => {
      let session = removeTally(done(9_000), item(), 0, AT);
      session = finishItem(addTally(session, item(), 3_000, AT), item(), AT);
      expect(session.countAtDone).toEqual({ [item().key]: 9_000 });
    });
  });

  describe('editing and removing Tallies', () => {
    it('edits one Tally in place', () => {
      const session = editTally(addTally(addTally(start(), item(), 4_000, AT), item(), 6_000, AT), item(), 1, 5_000, AT);
      expect(lineFor(session, item())).toMatchObject({ tallies: [4_000, 5_000], count: 9_000 });
    });

    it('removes one Tally', () => {
      const session = removeTally(addTally(addTally(start(), item(), 4_000, AT), item(), 6_000, AT), item(), 0, AT);
      expect(lineFor(session, item())).toMatchObject({ tallies: [6_000], count: 6_000 });
    });

    it('makes the Item Uncounted, and no longer Done, when its last Tally is removed', () => {
      const session = removeTally(done(10_000), item(), 0, AT);
      expect(lineFor(session, item())).toEqual({ status: 'uncounted' });
      expect(session.finished).toEqual({});
    });

    it('keeps the Count at Look Again on record even after every Tally is removed (audit trail)', () => {
      const session = removeTally(done(4_000), item(), 0, AT);
      expect(session.countAtLookAgain).toEqual({ [item().key]: 4_000 });
    });
  });

  it('records when the last Tally change happened', () => {
    const later = '2026-10-06T07:10:00.000Z';
    const session = addTally(addTally(start(), item(), 1_000, AT), item(), 1_000, later);
    expect(session.lastChangeAt).toBe(later);
  });

  it('never changes the Session it was given', () => {
    const before = start();
    finishItem(addTally(before, item(), 1_000, AT), item(), AT);
    expect(before).toEqual(start());
  });
});
