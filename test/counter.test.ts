import { describe, expect, it } from 'vitest';
import { parseBackup, toBackup } from '../src/domain/backup';
import type { Item } from '../src/domain/export';
import { addTally, finishItem, isReported, markReported, newSession, setCounter, withSessionDefaults } from '../src/domain/session';

// ADR 0007: the Counter's name is kept on the Session (optional; '' until it is known).
const AT = '2026-10-06T06:45:00.000Z';
const item: Item = { key: 'name:sugar|', duplicate: null, name: 'Sugar', variant: '', sku: '', category: '', expected: 10_000, cost: 150, flags: [] };
const OLD_SHAPE = {
  exportFileName: 'export.xlsx',
  loadedAt: '2026-10-06T06:30:00.000Z',
  lastChangeAt: AT,
  changes: 3,
  reportedChanges: 3,
  items: [item],
  tallies: { [item.key]: [7_000] },
  finished: { [item.key]: true as const },
  countAtDone: { [item.key]: 7_000 },
  countAtLookAgain: {},
};

describe('the Counter name on the Session', () => {
  it('is empty on a new Session', () => {
    expect(newSession('e.xlsx', AT, [item]).counter).toBe('');
  });

  it('is empty on a Session saved before it existed, and nothing else changes', () => {
    const loaded = withSessionDefaults(OLD_SHAPE);
    expect(loaded.counter).toBe('');
    expect(loaded).toMatchObject(OLD_SHAPE);
  });

  it('keeps a name that is already there', () => {
    expect(withSessionDefaults({ ...OLD_SHAPE, counter: 'Alex Moyo' }).counter).toBe('Alex Moyo');
  });

  it('is set with the spaces trimmed', () => {
    expect(setCounter(newSession('e.xlsx', AT, [item]), '  Alex Moyo ').counter).toBe('Alex Moyo');
  });

  it('changes no marker: not the Count markers, not the Adjustment markers, and the report stays reported', () => {
    const reported = markReported(finishItem(addTally(newSession('e.xlsx', AT, [item]), item, 7_000, AT), item, AT));
    const next = setCounter(reported, 'Alex');
    expect([next.changes, next.lastChangeAt, next.reportedChanges, next.adjustmentChanges]).toEqual([
      reported.changes,
      reported.lastChangeAt,
      reported.reportedChanges,
      reported.adjustmentChanges,
    ]);
    expect(isReported(next)).toBe(true);
    expect(next.tallies).toBe(reported.tallies);
  });

  it('is the very same Session when the name is already that', () => {
    const named = setCounter(newSession('e.xlsx', AT, [item]), 'Alex');
    expect(setCounter(named, ' Alex ')).toBe(named);
  });
});

describe('the Counter name in a backup (format 2, no version bump)', () => {
  it('is still format 2 and round-trips the name', () => {
    const session = setCounter(newSession('e.xlsx', AT, [item]), 'Alex Moyo');
    expect(JSON.parse(toBackup(session, { savedAt: AT })).format).toBe(2);
    expect(parseBackup(toBackup(session, { savedAt: AT }))).toEqual({ ok: true, session });
  });

  it('a format 1 backup and a format 2 backup without the field both restore with an empty name', () => {
    for (const format of [1, 2]) {
      const file = JSON.stringify({ app: 'stockcheck', format, savedAt: AT, session: OLD_SHAPE });
      const result = parseBackup(file);
      expect(result.ok && result.session.counter).toBe('');
    }
  });

  it('refuses a name that is not text', () => {
    const file = JSON.stringify({ app: 'stockcheck', format: 2, session: { ...OLD_SHAPE, counter: 42 } });
    expect(parseBackup(file)).toEqual({ ok: false, message: 'That backup is damaged and cannot be restored.' });
  });
});
