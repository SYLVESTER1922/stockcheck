import { describe, expect, it } from 'vitest';
import { parseBackup, toBackup } from '../src/domain/backup';
import type { Item } from '../src/domain/export';
import { addTally, finishItem, isReported, lineFor, newSession, withSessionDefaults, type Session } from '../src/domain/session';

// T19, ADR 0007: the new fields are optional in every saved Session and every backup.
const AT = '2026-10-06T06:45:00.000Z';
const item: Item = {
  key: 'name:sugar|2kg',
  duplicate: null,
  name: 'Sugar',
  variant: '2kg',
  sku: '',
  category: 'Grocery',
  expected: 10_000,
  cost: 150,
  flags: [],
};

/** A Session exactly as the pilot app saved it before ADR 0007: no wastage, no adjustment fields. */
const OLD_SHAPE = {
  exportFileName: 'export.xlsx',
  loadedAt: '2026-10-06T06:30:00.000Z',
  lastChangeAt: AT,
  changes: 3,
  reportedChanges: 2,
  items: [item],
  tallies: { [item.key]: [4_000, 3_000] },
  finished: { [item.key]: true as const },
  countAtDone: { [item.key]: 7_000 },
  countAtLookAgain: {},
};

const EMPTY_NEW_FIELDS = { wastage: {}, adjustments: {}, adjustmentChanges: 0, adjustmentsReportedChanges: null };

describe('new Session fields', () => {
  it('start empty on a new Session', () => {
    expect(newSession('export.xlsx', AT, [item])).toMatchObject(EMPTY_NEW_FIELDS);
  });

  it('are filled in with empty defaults, leaving everything else as it was', () => {
    expect(withSessionDefaults(OLD_SHAPE)).toEqual({ ...OLD_SHAPE, ...EMPTY_NEW_FIELDS });
  });

  it('keep what a newer Session already holds', () => {
    const adjustments = { a1: { itemKey: item.key, status: 'Held' as const, supplierDocument: '', linkedTo: null, log: [] } };
    const wastage = { [item.key]: { quantity: 2_000, reason: 'Expired' as const, note: '', register: 'R-1', at: AT } };
    const next = withSessionDefaults({ ...OLD_SHAPE, wastage, adjustments, adjustmentChanges: 4, adjustmentsReportedChanges: 3 });
    expect(next).toMatchObject({ wastage, adjustments, adjustmentChanges: 4, adjustmentsReportedChanges: 3 });
  });
});

describe('a Session that was in progress before the update', () => {
  it('keeps every Count, Done, Look Again and reported marker, and shows the same Variance', () => {
    const loaded = withSessionDefaults(OLD_SHAPE);
    expect(loaded).toMatchObject({ ...OLD_SHAPE });
    expect(loaded.reportedChanges).toBe(2);
    expect(loaded.changes).toBe(3);
    expect(lineFor(loaded, item)).toMatchObject({ status: 'finished', count: 7_000, variance: -3_000 });
    expect(lineFor(loaded, item)).toEqual(lineFor(OLD_SHAPE as unknown as Session, item));
  });

  it('is still reported or not exactly as before', () => {
    expect(isReported(withSessionDefaults(OLD_SHAPE))).toBe(false); // reportedChanges 2, changes 3
    expect(isReported(withSessionDefaults({ ...OLD_SHAPE, reportedChanges: 3 }))).toBe(true);
  });

  it('fills the defaults for the fields even older versions lacked', () => {
    const minimal = { exportFileName: 'e.xlsx', loadedAt: AT, items: [item], tallies: {} };
    expect(withSessionDefaults(minimal)).toMatchObject({ changes: 0, reportedChanges: null, finished: {}, countAtDone: {}, ...EMPTY_NEW_FIELDS });
  });
});

describe('Backup format 2', () => {
  const counted = () => finishItem(addTally(newSession('export.xlsx', AT, [item]), item, 9_000, AT), item, AT);

  it('is written for every Session', () => {
    expect(JSON.parse(toBackup(counted(), { savedAt: AT })).format).toBe(2);
  });

  it('round-trips a Session with the new fields', () => {
    const session = { ...counted(), adjustmentChanges: 5, adjustmentsReportedChanges: 4 };
    expect(parseBackup(toBackup(session, { savedAt: AT }))).toEqual({ ok: true, session });
  });

  it('still restores a format 1 backup, with the defaults filled in', () => {
    const v1 = JSON.stringify({ app: 'stockcheck', format: 1, savedAt: AT, session: OLD_SHAPE });
    expect(parseBackup(v1)).toEqual({ ok: true, session: { ...OLD_SHAPE, ...EMPTY_NEW_FIELDS } });
  });

  it('refuses format 3 and above with the update message', () => {
    const v3 = JSON.stringify({ app: 'stockcheck', format: 3, session: OLD_SHAPE });
    expect(parseBackup(v3)).toEqual({
      ok: false,
      message: 'That backup was made by a newer version of StockCheck. Update the app, then try again.',
    });
  });

  it('is refused, with the update message, by the format-1 reader that is on phones today', () => {
    // A copy of today's check (backup.ts before T19): any format above its own is "newer".
    const legacyAccepts = (text: string) => JSON.parse(text).format <= 1;
    expect(legacyAccepts(toBackup(counted(), { savedAt: AT }))).toBe(false);
    expect(legacyAccepts(JSON.stringify({ app: 'stockcheck', format: 1, session: OLD_SHAPE }))).toBe(true);
  });

  it.each([
    ['wastage that is not a record', { wastage: 'oops' }],
    ['adjustments that are not a record', { adjustments: [] }],
    ['an adjustment without a log', { adjustments: { a1: { itemKey: 'k', status: 'Held' } } }],
    ['a wastage entry without a quantity', { wastage: { k: { reason: 'Expired' } } }],
    ['a marker that is not a number', { adjustmentChanges: 'many' }],
    ['a reported marker that is not a number or null', { adjustmentsReportedChanges: 'x' }],
  ])('treats %s as damaged', (_label, extra) => {
    const file = JSON.stringify({ app: 'stockcheck', format: 2, session: { ...OLD_SHAPE, ...extra } });
    expect(parseBackup(file)).toEqual({ ok: false, message: 'That backup is damaged and cannot be restored.' });
  });
});
