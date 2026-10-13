import { describe, expect, it } from 'vitest';
import {
  acknowledge,
  adjustmentFor,
  deriveAdjustments,
  raiseCorrection,
  setSupplierDocument,
  transition,
  type Adjustment,
  type AdjustmentResult,
} from '../src/domain/adjustments';
import { statusCounts } from '../src/domain/adjustView';
import { parseBackup, toBackup } from '../src/domain/backup';
import type { Item } from '../src/domain/export';
import {
  addTally,
  editTally,
  finishItem,
  newSession,
  removeTally,
  setWastage,
  type AdjustmentRecord,
  type AdjustmentStatus,
  type Session,
} from '../src/domain/session';
import { parseWastage } from '../src/domain/wastage';

// T25, ADR 0007: what happens to Adjustments when a Count changes or Done is removed.
// Quantities are thousandths: 100 units = 100_000.
const AT = '2026-10-06T06:45:00.000Z';
const T = (n: number) => `2026-10-07T0${n}:00:00.000Z`;
const item = (key: string, name: string, expected: number, cost: number): Item => ({
  key, duplicate: null, name, variant: '', sku: '', category: '', expected, cost, flags: [],
});
const SUGAR = item('sku:S1', 'Sugar', 100_000, 150); // count 85 → −15: REMOVE 15
const OIL = item('sku:O1', 'Oil', 5_000, 200); // count 8 → +3: ADD 3
const CORRECTING = 'sku:S1~2';

function session(): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', [SUGAR, OIL]);
  s = finishItem(addTally(s, SUGAR, 85_000, AT), SUGAR, AT);
  return finishItem(addTally(s, OIL, 8_000, AT), OIL, AT);
}

const ok = (r: AdjustmentResult): Session => {
  if (!r.ok) throw new Error(`expected success, refused: ${r.message}`);
  return r.session;
};
const move = (s: Session, it: Item, to: AdjustmentStatus, over: { id?: string; by?: string; note?: string; at?: string } = {}) =>
  ok(transition(s, it, { to, by: 'Mary', note: 'because', at: T(8), appliedCheck: true, ...over }));
const withDoc = (s: Session, it: Item, id?: string) => ok(setSupplierDocument(s, it, 'INV-1', 'Mary', T(8), id));
const approved = (s = session(), it = SUGAR) => move(s, it, 'Approved', { by: 'Mary', at: T(1) });
const applied = (s = session(), it = SUGAR) => move(approved(s, it), it, 'Applied', { by: 'Joe', at: T(2) });
const setCount = (s: Session, it: Item, thousandths: number, at = T(3)) => editTally(s, it, 0, thousandths, at);
const rows = (s: Session, it: Item = SUGAR): Adjustment[] => deriveAdjustments(s).list.filter((a) => a.item.key === it.key);
const only = (s: Session, it: Item = SUGAR): Adjustment => {
  const found = rows(s, it);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const record = (s: Session, id = SUGAR.key): AdjustmentRecord => s.adjustments[id]!;
const wasted = (s: Session, it: Item, quantity: string) => {
  const r = parseWastage({ quantity, reason: 'Expired', note: '', register: 'R-1', confirmed: true }, AT);
  if (!r.ok) throw new Error(r.message);
  return setWastage(s, it, r.entry);
};

describe('the Count changes after Approved', () => {
  const s0 = wasted(session(), SUGAR, '10');
  const s1 = approved(s0);
  const s2 = setCount(s1, SUGAR, 88_000);

  it('returns to Pending, with a "count changed" marker, and the quantity follows the new Count', () => {
    expect(adjustmentFor(s2, SUGAR)).toMatchObject({
      status: 'Pending',
      storedStatus: 'Pending',
      approval: null,
      quantity: 12_000,
      total: -12_000,
      countChange: { from: 85_000, to: 88_000 },
    });
  });

  it('keeps the old Approval in the history, with its snapshot, and logs the change as automatic', () => {
    const log = record(s2).log;
    expect(log).toHaveLength(2);
    expect(log[0]).toMatchObject({ by: 'Mary', to: 'Approved', snapshot: { count: 85_000, quantity: 15_000, wastage: 10_000, unexplained: -5_000 } });
    expect(log[1]).toEqual({ at: T(3), by: '', auto: true, action: 'Count changed', note: '', from: 'Approved', to: 'Pending', countFrom: 85_000, countTo: 88_000 });
  });

  it('moves only the Adjustment marker for the revert, and the Count marker for the edit', () => {
    expect(s2.adjustmentChanges).toBe(s1.adjustmentChanges + 1);
    expect(s2.changes).toBe(s1.changes + 1);
  });

  it('happens for any Count change: another place added, or a Tally removed', () => {
    expect(adjustmentFor(addTally(s1, SUGAR, 3_000, T(3)), SUGAR)!.status).toBe('Pending');
    const two = approved(finishItem(addTally(addTally(newSession('e.xlsx', AT, [SUGAR]), SUGAR, 50_000, AT), SUGAR, 35_000, AT), SUGAR, AT));
    expect(adjustmentFor(removeTally(two, SUGAR, 1, T(3)), SUGAR)).toMatchObject({ status: 'Pending', total: -50_000 });
  });

  it('restores nothing when the Tally is edited back: it stays Pending and needs approving again', () => {
    const back = setCount(s2, SUGAR, 85_000, T(4));
    expect(adjustmentFor(back, SUGAR)).toMatchObject({ status: 'Pending', approval: null });
    const again = move(back, SUGAR, 'Approved', { at: T(5) });
    expect(adjustmentFor(again, SUGAR)!.approval).toMatchObject({ at: T(5), snapshot: { count: 85_000 } });
    expect(record(again).log).toHaveLength(3);
  });

  it('does not touch an Item whose Count did not change, or whose Adjustment is not Approved', () => {
    expect(record(setCount(s1, OIL, 9_000))).toBe(record(s1));
    const pending = session();
    expect(setCount(pending, OIL, 9_000).adjustments).toBe(pending.adjustments);
  });

  it('keeps the marker visible until a new decision is made', () => {
    expect(adjustmentFor(s2, SUGAR)!.countChange).not.toBeNull();
    expect(adjustmentFor(move(s2, SUGAR, 'Held'), SUGAR)!.countChange).toBeNull();
  });
});

describe('Done is removed (the last Tally goes)', () => {
  const drop = (s: Session, it: Item = SUGAR) => removeTally(s, it, 0, T(3));

  it('drops a Pending or Held or Rejected Adjustment that has no Approval in its history', () => {
    for (const to of ['Held', 'Rejected'] as const) expect(drop(move(session(), SUGAR, to)).adjustments).toEqual({});
    const doc = withDoc(session(), OIL);
    expect(drop(doc, OIL).adjustments).toEqual({});
    expect(rows(drop(move(session(), SUGAR, 'Held')))).toEqual([]);
  });

  it('keeps an Approved Adjustment as history, marked "count removed", with its snapshot and Wastage split', () => {
    const s = drop(approved(wasted(session(), SUGAR, '10')));
    expect(s.wastage).toEqual({}); // the live Wastage is dropped
    const a = only(s);
    expect(a).toMatchObject({ gone: 'count-removed', status: 'Pending', quantity: 15_000, total: -15_000, count: 85_000, wastage: 10_000, unexplained: -5_000, approval: null });
    expect(record(s).log.map((e) => e.action)).toEqual(['Approved', 'Count removed']);
    expect(record(s).log[0]!.snapshot).toMatchObject({ wastage: 10_000, unexplained: -5_000 });
  });

  it('offers no move on that history, and refuses one with its message', () => {
    const s = drop(approved());
    expect(transition(s, SUGAR, { to: 'Approved', by: 'Mary', at: T(8) })).toMatchObject({ ok: false, reason: 'no-adjustment' });
  });

  it('keeps a Pending Adjustment whose Approval was revoked earlier, because the Approval is history', () => {
    const revoked = move(approved(), SUGAR, 'Pending', { note: 'Wrong Item' });
    expect(only(drop(revoked))).toMatchObject({ gone: 'count-removed' });
    expect(record(drop(revoked)).log.map((e) => e.action)).toEqual(['Approved', 'Pending', 'Count removed']);
  });

  it('does not bring the old approval back when the Item is counted again', () => {
    const s = drop(approved());
    const again = finishItem(addTally(s, SUGAR, 90_000, T(4)), SUGAR, T(4));
    expect(adjustmentFor(again, SUGAR)).toMatchObject({ status: 'Pending', approval: null, gone: null, total: -10_000 });
    expect(adjustmentFor(again, SUGAR)!.countChange).toEqual({ from: 85_000, to: null });
  });
});

describe('an Applied record never disappears', () => {
  const s1 = applied();

  it('after a Count change it is still the same Applied row, as applied, with a review flag', () => {
    const s2 = setCount(s1, SUGAR, 88_000);
    const a = only(s2);
    expect(a).toMatchObject({
      status: 'Applied',
      direction: 'REMOVE',
      quantity: 15_000,
      total: -15_000,
      count: 85_000,
      review: { reason: 'count-changed', appliedCount: 85_000, currentCount: 88_000, canCorrect: true },
    });
    expect(a.applied).toMatchObject({ by: 'Joe' });
  });

  it('leaves the Applied record itself exactly as it was', () => {
    const s2 = setCount(s1, SUGAR, 88_000);
    expect(record(s2)).toEqual(record(s1));
    expect(s2.adjustmentChanges).toBe(s1.adjustmentChanges);
  });

  it('when the Variance becomes zero, it is still listed, marked as changed after Applied', () => {
    const s2 = setCount(s1, SUGAR, 100_000); // Count = Expected: no Variance, so no derived Adjustment
    expect(adjustmentFor(s2, SUGAR)).toMatchObject({ status: 'Applied', review: { reason: 'count-changed', currentCount: 100_000, canCorrect: true } });
    expect(rows(s2)).toHaveLength(1);
    expect(deriveAdjustments(s2).matching).toBe(1); // the Item matches, and its Applied row is still there
    expect(statusCounts(deriveAdjustments(s2).list).Applied).toBe(1);
  });

  it('when Done is removed, it is listed as "count removed", with a note on its log, and cannot be corrected yet', () => {
    const s2 = removeTally(s1, SUGAR, 0, T(3));
    expect(only(s2)).toMatchObject({ status: 'Applied', review: { reason: 'count-removed', appliedCount: 85_000, currentCount: null, canCorrect: false } });
    expect(record(s2).status).toBe('Applied');
    expect(record(s2).log.at(-1)).toMatchObject({ auto: true, action: 'Count removed' });
    expect(record(s2).log.slice(0, -1)).toEqual(record(s1).log); // what was there is untouched
  });

  it('counted again after a removal, the flag compares with the Count that was applied', () => {
    const again = finishItem(addTally(removeTally(s1, SUGAR, 0, T(3)), SUGAR, 90_000, T(4)), SUGAR, T(4));
    expect(only(again).review).toMatchObject({ reason: 'count-changed', appliedCount: 85_000, currentCount: 90_000 });
    const same = finishItem(addTally(removeTally(s1, SUGAR, 0, T(3)), SUGAR, 85_000, T(4)), SUGAR, T(4));
    expect(only(same).review).toBeNull();
  });

  it('the flag goes away by itself only if the Count is back to the applied Count', () => {
    expect(only(setCount(setCount(s1, SUGAR, 88_000), SUGAR, 85_000)).review).toBeNull();
  });

  it('is counted as needing review, so the tab can say so', () => {
    expect(deriveAdjustments(s1).needsReview).toBe(0);
    expect(deriveAdjustments(setCount(s1, SUGAR, 88_000)).needsReview).toBe(1);
  });

  it('is shown even if its Item is unknown to the Export, or Expected cannot be read', () => {
    const odd: Session = { ...s1, items: s1.items.map((i) => (i.key === SUGAR.key ? { ...i, expected: null } : i)) };
    expect(rows(odd).map((a) => a.status)).toEqual(['Applied']);
  });
});

describe('Acknowledge, no action needed', () => {
  const s2 = setCount(applied(), SUGAR, 88_000);
  const input = { by: 'Mary', note: 'Recount agreed', at: T(5) };

  it('clears the flag, logs who, when and why, and leaves the Applied record otherwise alone', () => {
    const s3 = ok(acknowledge(s2, SUGAR, input));
    expect(only(s3)).toMatchObject({ status: 'Applied', review: null, quantity: 15_000 });
    expect(record(s3).status).toBe('Applied');
    expect(record(s3).log.slice(0, -1)).toEqual(record(s2).log);
    expect(record(s3).log.at(-1)).toEqual({ at: T(5), by: 'Mary', action: 'Acknowledged', note: 'Recount agreed', reviewedCount: 88_000 });
    expect(s3.adjustmentChanges).toBe(s2.adjustmentChanges + 1);
    expect(s3.changes).toBe(s2.changes);
  });

  it('needs a typed name and a note, and says so', () => {
    expect(acknowledge(s2, SUGAR, { ...input, by: ' ' })).toMatchObject({ ok: false, reason: 'name-required' });
    expect(acknowledge(s2, SUGAR, { ...input, note: ' ' })).toMatchObject({ ok: false, reason: 'note-required' });
  });

  it('is refused when there is nothing to review, including a second time', () => {
    expect(acknowledge(applied(), SUGAR, input)).toMatchObject({ ok: false, reason: 'no-review' });
    expect(acknowledge(ok(acknowledge(s2, SUGAR, input)), SUGAR, input)).toMatchObject({ ok: false, reason: 'no-review' });
  });

  it('flags again if the Count changes once more', () => {
    const s3 = ok(acknowledge(s2, SUGAR, input));
    expect(only(setCount(s3, SUGAR, 90_000)).review).toMatchObject({ appliedCount: 85_000, currentCount: 90_000 });
    expect(only(setCount(s3, SUGAR, 88_000, T(6))).review).toBeNull();
  });

  it('can acknowledge a removed count, and flags again when it is counted differently', () => {
    const gone = removeTally(applied(), SUGAR, 0, T(3));
    const s3 = ok(acknowledge(gone, SUGAR, input));
    expect(only(s3).review).toBeNull();
    const again = finishItem(addTally(s3, SUGAR, 90_000, T(4)), SUGAR, T(4));
    expect(only(again).review).toMatchObject({ currentCount: 90_000 });
  });
});

describe('Raise a correcting Adjustment', () => {
  const s2 = setCount(applied(), SUGAR, 88_000); // applied REMOVE 15; the Item is now short by only 12
  const input = { by: 'Mary', note: 'Three more found', at: T(5) };
  const s3 = ok(raiseCorrection(s2, SUGAR, input));

  it('creates a NEW Adjustment: new Total Variance minus the quantity already applied (ADD +3)', () => {
    const correcting = rows(s3).find((a) => a.id === CORRECTING)!;
    expect(correcting).toMatchObject({
      kind: 'correcting',
      linkedTo: SUGAR.key,
      direction: 'ADD',
      quantity: 3_000,
      total: 3_000,
      storedStatus: 'Pending',
      status: 'Held', // an ADD with no Supplier Document
      needsSupplierDocument: true,
    });
    expect(correcting.corrects).toMatchObject({ id: SUGAR.key, direction: 'REMOVE', quantity: 15_000, by: 'Joe' });
  });

  it('is a REMOVE when the difference is negative: applied ADD +3, now only +1', () => {
    const a = move(withDoc(session(), OIL), OIL, 'Approved', { at: T(1) });
    const done = move(a, OIL, 'Applied', { by: 'Joe', at: T(2) });
    const changed = setCount(done, OIL, 6_000); // total +1
    const r = ok(raiseCorrection(changed, OIL, input));
    expect(rows(r, OIL).find((x) => x.kind === 'correcting')).toMatchObject({ direction: 'REMOVE', quantity: 2_000, total: -2_000, status: 'Pending' });
  });

  it('shows the link on both rows, and clears the flag', () => {
    const [applied1, correcting] = [rows(s3).find((a) => a.id === SUGAR.key)!, rows(s3).find((a) => a.id === CORRECTING)!];
    expect(applied1.review).toBeNull();
    expect(applied1.correctedBy).toEqual([expect.objectContaining({ id: CORRECTING, direction: 'ADD', quantity: 3_000, status: 'Held' })]);
    expect(correcting.linkedTo).toBe(SUGAR.key);
    expect(applied1.status).toBe('Applied');
  });

  it('leaves the original Applied record as it was, apart from the logged review', () => {
    expect(record(s3).status).toBe('Applied');
    expect(record(s3).log.slice(0, -1)).toEqual(record(s2).log);
    expect(record(s3).log.at(-1)).toEqual({ at: T(5), by: 'Mary', action: 'Correcting Adjustment raised', note: 'Three more found', reviewedCount: 88_000, linkedId: CORRECTING });
    expect(record(s3, CORRECTING)).toMatchObject({ itemKey: SUGAR.key, status: 'Pending', linkedTo: SUGAR.key, supplierDocument: '' });
    expect(record(s3, CORRECTING).log).toEqual([{ at: T(5), by: 'Mary', action: 'Correcting Adjustment raised', note: 'Three more found' }]);
    expect(s3.adjustmentChanges).toBe(s2.adjustmentChanges + 1);
  });

  it('goes through the same statuses: an ADD needs a Supplier Document, and Applied needs the tick', () => {
    expect(transition(s3, SUGAR, { to: 'Approved', by: 'Mary', at: T(6), id: CORRECTING })).toMatchObject({ ok: false, reason: 'supplier-document-required' });
    const doc = withDoc(s3, SUGAR, CORRECTING);
    const ap = move(doc, SUGAR, 'Approved', { id: CORRECTING, at: T(6) });
    expect(transition(ap, SUGAR, { to: 'Applied', by: 'Joe', at: T(7), id: CORRECTING })).toMatchObject({ ok: false, reason: 'applied-check-required' });
    const done = move(ap, SUGAR, 'Applied', { id: CORRECTING, by: 'Joe', at: T(7) });
    expect(rows(done).map((a) => [a.id, a.status])).toEqual([[SUGAR.key, 'Applied'], [CORRECTING, 'Applied']]);
    expect(rows(done).every((a) => a.review === null)).toBe(true); // everything applied matches the Count: residual 0
  });

  it('only the latest Applied row is flagged when the Count changes again', () => {
    const doc = move(move(withDoc(s3, SUGAR, CORRECTING), SUGAR, 'Approved', { id: CORRECTING, at: T(6) }), SUGAR, 'Applied', { id: CORRECTING, by: 'Joe', at: T(7) });
    const again = setCount(doc, SUGAR, 90_000);
    expect(rows(again).map((a) => [a.id, a.review?.currentCount ?? null])).toEqual([[SUGAR.key, null], [CORRECTING, 90_000]]);
    // applied net is −15 + 3 = −12; the Item is now short by 10, so the next correction is ADD 2
    expect(rows(again).find((a) => a.id === CORRECTING)!.review).toMatchObject({ appliedCount: 88_000, canCorrect: true });
    const next = ok(raiseCorrection(again, SUGAR, { ...input, at: T(8) }));
    expect(rows(next).find((a) => a.id === 'sku:S1~3')).toMatchObject({ direction: 'ADD', quantity: 2_000, linkedTo: CORRECTING });
  });

  it('the flag stays away while a correction is open, and comes back if it is rejected and the Count moves', () => {
    const rejected = move(s3, SUGAR, 'Rejected', { id: CORRECTING });
    expect(rows(rejected).find((a) => a.id === SUGAR.key)!.review).toBeNull(); // reviewed for this Count
    expect(rows(setCount(rejected, SUGAR, 90_000)).find((a) => a.id === SUGAR.key)!.review).toMatchObject({ currentCount: 90_000 });
    expect(rows(setCount(s3, SUGAR, 90_000)).find((a) => a.id === SUGAR.key)!.review).toBeNull(); // open correction follows the Count
  });

  it('follows the Count while it is open, and an Approved correction reverts like any other', () => {
    const open = withDoc(s3, SUGAR, CORRECTING);
    const approvedCorrection = move(open, SUGAR, 'Approved', { id: CORRECTING, at: T(6) });
    const moved = setCount(approvedCorrection, SUGAR, 90_000);
    expect(rows(moved).find((a) => a.id === CORRECTING)).toMatchObject({ status: 'Pending', quantity: 5_000, total: 5_000, countChange: { from: 88_000, to: 90_000 } });
  });

  it('needs a name and a note, and says so', () => {
    expect(raiseCorrection(s2, SUGAR, { ...input, by: '' })).toMatchObject({ ok: false, reason: 'name-required' });
    expect(raiseCorrection(s2, SUGAR, { ...input, note: '' })).toMatchObject({ ok: false, reason: 'note-required' });
  });

  it('is refused when nothing is flagged, when the count was removed, and when there is nothing to correct', () => {
    expect(raiseCorrection(applied(), SUGAR, input)).toMatchObject({ ok: false, reason: 'no-review' });
    expect(raiseCorrection(removeTally(applied(), SUGAR, 0, T(3)), SUGAR, input)).toMatchObject({ ok: false, reason: 'count-removed' });
    // A hand-made state: what was applied already equals the new Total Variance, but the Counts differ.
    const odd = setCount(applied(), SUGAR, 88_000);
    const tweaked: Session = {
      ...odd,
      adjustments: {
        [SUGAR.key]: { ...record(odd), log: record(odd).log.map((e) => (e.snapshot ? { ...e, snapshot: { ...e.snapshot, total: -12_000 } } : e)) },
      },
    };
    expect(only(tweaked).review).toMatchObject({ canCorrect: false });
    expect(raiseCorrection(tweaked, SUGAR, input)).toMatchObject({ ok: false, reason: 'nothing-to-correct' });
  });

  it('cannot be raised again while the first is open', () => {
    expect(raiseCorrection(s3, SUGAR, input)).toMatchObject({ ok: false, reason: 'no-review' });
  });
});

describe('data left by an older version of the app', () => {
  it('ignores a Pending or Held record for an Item that is not Done, so it is not in the list or the totals', () => {
    const stray: Session = { ...session(), adjustments: { 'name:ghost|': { itemKey: 'name:ghost|', status: 'Held', supplierDocument: '', linkedTo: null, log: [] } } };
    expect(deriveAdjustments(stray).list.map((a) => a.id)).toEqual([SUGAR.key, OIL.key]);
    const uncounted = newSession('e.xlsx', AT, [SUGAR]);
    const record0: AdjustmentRecord = { itemKey: SUGAR.key, status: 'Pending', supplierDocument: '', linkedTo: null, log: [] };
    expect(deriveAdjustments({ ...uncounted, adjustments: { [SUGAR.key]: record0 } }).list).toEqual([]);
  });

  it('treats an Approved record whose Count no longer matches as Pending, without changing the Session', () => {
    const s1 = approved();
    const old: Session = { ...s1, tallies: { ...s1.tallies, [SUGAR.key]: [88_000] } }; // an older version edited the Tally
    expect(adjustmentFor(old, SUGAR)).toMatchObject({ status: 'Pending', storedStatus: 'Pending', approval: null, countChange: { from: 85_000, to: 88_000 } });
    expect(old.adjustments).toBe(s1.adjustments);
    expect(transition(old, SUGAR, { to: 'Approved', by: 'Mary', at: T(6) }).ok).toBe(true);
  });

  it('still lists an Applied record whose Done an older version removed', () => {
    const s1 = applied();
    const old: Session = { ...s1, tallies: {}, finished: {} };
    expect(only(old)).toMatchObject({ status: 'Applied', review: { reason: 'count-removed', currentCount: null } });
  });
});

describe('everything stays stored in the Session and round-trips', () => {
  it('a Session with auto entries, a review and a correcting Adjustment survives a backup', () => {
    let s = setCount(applied(), SUGAR, 88_000);
    s = ok(raiseCorrection(s, SUGAR, { by: 'Mary', note: 'n', at: T(5) }));
    s = setCount(approved(withDoc(s, OIL), OIL), OIL, 9_000);
    const restored = parseBackup(toBackup(s, { savedAt: T(9) }));
    expect(restored).toEqual({ ok: true, session: s });
    if (restored.ok) expect(deriveAdjustments(restored.session)).toEqual(deriveAdjustments(s));
  });

  it('Wastage entered after Approval does not cancel it: only the Count does (ADR 0007)', () => {
    const s = wasted(approved(), SUGAR, '4');
    expect(adjustmentFor(s, SUGAR)).toMatchObject({ status: 'Approved', wastage: 4_000 });
    expect(adjustmentFor(s, SUGAR)!.approval!.snapshot.wastage).toBe(0); // the Approval recorded what was agreed
  });
});
