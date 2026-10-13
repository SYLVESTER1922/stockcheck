import { describe, expect, it } from 'vitest';
import { setSupplierDocument, transition } from '../src/domain/adjustments';
import { parseBackup, toBackup } from '../src/domain/backup';
import type { Item } from '../src/domain/export';
import {
  adjustmentsGuard,
  adjustmentsLine,
  isAdjustmentsReported,
  markAdjustmentsReported,
  needsGuard,
} from '../src/domain/replaceGuard';
import {
  addTally,
  canReplace,
  editTally,
  finishItem,
  isReported,
  markReported,
  newSession,
  removeTally,
  withSessionDefaults,
  type AdjustmentStatus,
  type Session,
} from '../src/domain/session';

// T26, ADR 0007: a new Export or a restore must not silently throw away Adjustments that are not yet reported.
const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, expected: number, cost = 150): Item => ({ key, duplicate: null, name: key, variant: '', sku: '', category: '', expected, cost, flags: [] });
const A = item('name:a|', 100_000); // count 85 → REMOVE 15
const B = item('name:b|', 100_000); // count 90 → REMOVE 10
const C = item('name:c|', 5_000); // count 8 → ADD 3 (needs a Supplier Document)

/** A counted Session whose Session Report has been downloaded: only Adjustments can still be at stake. */
function reportedSession(): Session {
  let s = newSession('export.xlsx', AT, [A, B, C]);
  s = finishItem(addTally(s, A, 85_000, AT), A, AT);
  s = finishItem(addTally(s, B, 90_000, AT), B, AT);
  s = finishItem(addTally(s, C, 8_000, AT), C, AT);
  return markReported(s);
}
const ok = (r: ReturnType<typeof transition>): Session => {
  if (!r.ok) throw new Error(r.message);
  return r.session;
};
const move = (s: Session, it: Item, to: AdjustmentStatus) => ok(transition(s, it, { to, by: 'Mary', note: 'n', at: AT, appliedCheck: true }));
const withDoc = (s: Session) => ok(setSupplierDocument(s, C, 'INV-1', 'Mary', AT));
const approved = (s = reportedSession(), it = A) => move(s, it, 'Approved');
const applied = (s = reportedSession(), it = A) => move(approved(s, it), it, 'Applied');

describe('Sessions with nothing to protect', () => {
  it('a counted, reported Session with no Adjustment records is not guarded', () => {
    const s = reportedSession();
    expect(adjustmentsGuard(s)).toEqual({ level: 'none' });
    expect(needsGuard(s)).toBe(false);
  });

  it('untouched Adjustments (derived, nobody acted on them) do not trigger it, so the pilot flow is unchanged', () => {
    // A, B and C all have an Adjustment waiting, but there is no record: the Session Report already holds the numbers.
    expect(Object.keys(reportedSession().adjustments)).toEqual([]);
    expect(needsGuard(reportedSession())).toBe(false);
  });

  it('an old-shape Session (saved before ADR 0007) with none is not guarded', () => {
    const OLD_SHAPE = {
      exportFileName: 'export.xlsx',
      loadedAt: '2026-10-06T06:30:00.000Z',
      lastChangeAt: AT,
      changes: 3,
      reportedChanges: 3,
      items: [A],
      tallies: { [A.key]: [85_000] },
      finished: { [A.key]: true as const },
      countAtDone: { [A.key]: 85_000 },
      countAtLookAgain: {},
    };
    const loaded = withSessionDefaults(OLD_SHAPE);
    expect(canReplace(loaded)).toBe(true);
    expect(needsGuard(loaded)).toBe(false);
    const unreported = withSessionDefaults({ ...OLD_SHAPE, reportedChanges: null });
    expect(adjustmentsGuard(unreported)).toEqual({ level: 'none' }); // the Counts guard still applies, the Adjustments one does not
    expect(needsGuard(unreported)).toBe(true);
    const restored = parseBackup(JSON.stringify({ app: 'stockcheck', format: 1, savedAt: AT, session: OLD_SHAPE }));
    expect(restored.ok && needsGuard(restored.session)).toBe(false);
  });

  it('an empty Session is not guarded', () => {
    expect(needsGuard(newSession('e.xlsx', AT, [A]))).toBe(false);
  });
});

describe('Approved but not Applied: a block', () => {
  it('guards the Session, and says how many', () => {
    const s = approved();
    expect(adjustmentsGuard(s)).toEqual({ level: 'block', approved: 1, pending: 0, held: 0 });
    expect(needsGuard(s)).toBe(true);
    expect(canReplace(s)).toBe(true); // the Counts are reported: it is the Adjustments that guard it
  });

  it('counts every Approved Adjustment, and shows the others beside them', () => {
    let s = approved(reportedSession(), A);
    s = approved(s, B);
    s = move(s, C, 'Held');
    expect(adjustmentsGuard(s)).toEqual({ level: 'block', approved: 2, pending: 0, held: 1 });
  });

  it('is cleared when the Adjustment is Applied', () => {
    expect(needsGuard(applied())).toBe(false);
  });

  it('a revoked Approval is no longer a block, but its record is still a warning', () => {
    const revoked = ok(transition(approved(), A, { to: 'Pending', by: 'Mary', note: 'wrong Item', at: AT }));
    expect(adjustmentsGuard(revoked)).toEqual({ level: 'warn', approved: 0, pending: 1, held: 0 });
  });

  it('is still there if a Session Report is downloaded: that is a different record', () => {
    const s = markReported(approved());
    expect(adjustmentsGuard(s).level).toBe('block');
    expect(needsGuard(s)).toBe(true);
  });
});

describe('only Pending or Held with something recorded: a warning', () => {
  it('a Held Adjustment put on hold by a person', () => {
    expect(adjustmentsGuard(move(reportedSession(), A, 'Held'))).toEqual({ level: 'warn', approved: 0, pending: 0, held: 1 });
  });

  it('a Pending Adjustment that has a Supplier Document recorded', () => {
    expect(adjustmentsGuard(withDoc(reportedSession()))).toEqual({ level: 'warn', approved: 0, pending: 1, held: 0 });
  });

  it('a Pending Adjustment whose cancelled Approval is in its history', () => {
    const changed = editTally(approved(), A, 0, 88_000, AT); // the Approval is cancelled automatically
    expect(adjustmentsGuard(changed)).toEqual({ level: 'warn', approved: 0, pending: 1, held: 0 });
  });

  it('history of an Approval whose count was removed', () => {
    const removed = removeTally(approved(), A, 0, AT);
    expect(adjustmentsGuard(removed)).toEqual({ level: 'warn', approved: 0, pending: 1, held: 0 });
  });

  it('an ADD shown as Held only for want of a Supplier Document is not a decision, so it does not count', () => {
    expect(adjustmentsGuard(reportedSession()).level).toBe('none'); // C is shown as Held, but nothing was recorded
  });
});

describe('Applied, Rejected and nothing-to-do Sessions are not blocked', () => {
  it('Applied', () => expect(needsGuard(applied())).toBe(false));
  it('Rejected', () => expect(needsGuard(move(reportedSession(), A, 'Rejected'))).toBe(false));
  it('Applied beside Rejected', () => {
    expect(needsGuard(move(applied(reportedSession(), A), B, 'Rejected'))).toBe(false);
  });
  it('an Applied Adjustment that needs a review is not blocked either', () => {
    const changed = editTally(applied(), A, 0, 88_000, AT);
    expect(needsGuard(markReported(changed))).toBe(false);
  });
  it('Applied beside an Approved one: the Approved one blocks', () => {
    expect(adjustmentsGuard(approved(applied(reportedSession(), A), B)).level).toBe('block');
  });
});

describe('the Adjustment Report marker (used by T27)', () => {
  it('starts as not reported, with nothing recorded to report', () => {
    expect(isAdjustmentsReported(reportedSession())).toBe(false);
  });

  it('reporting clears the block, and the warning, until the next workflow change', () => {
    const s = markAdjustmentsReported(approved());
    expect(isAdjustmentsReported(s)).toBe(true);
    expect(adjustmentsGuard(s)).toEqual({ level: 'none' });
    expect(needsGuard(s)).toBe(false);
    const held = markAdjustmentsReported(move(reportedSession(), A, 'Held'));
    expect(adjustmentsGuard(held)).toEqual({ level: 'none' });
  });

  it('a later workflow change brings the block back', () => {
    const s = approved(markAdjustmentsReported(approved(reportedSession(), A)), B);
    expect(adjustmentsGuard(s)).toEqual({ level: 'block', approved: 2, pending: 0, held: 0 });
  });

  it('an automatic cancel (a Count change) is a workflow change too', () => {
    const reported = markAdjustmentsReported(approved());
    expect(isAdjustmentsReported(editTally(reported, A, 0, 88_000, AT))).toBe(false);
  });

  it('never touches the Session Report marker, and the Session Report marker never touches it', () => {
    const before = approved();
    const after = markAdjustmentsReported(before);
    expect([after.changes, after.reportedChanges, after.lastChangeAt]).toEqual([before.changes, before.reportedChanges, before.lastChangeAt]);
    expect(isReported(after)).toBe(isReported(before));
    expect(isAdjustmentsReported(markReported(before))).toBe(false);
  });

  it('does not make unreported Counts replaceable', () => {
    const unreportedCounts = markAdjustmentsReported(approved(editTally(reportedSession(), B, 0, 91_000, AT)));
    expect(canReplace(unreportedCounts)).toBe(false);
    expect(needsGuard(unreportedCounts)).toBe(true);
  });

  it('survives a backup', () => {
    const s = markAdjustmentsReported(approved());
    const restored = parseBackup(toBackup(s, { savedAt: AT }));
    expect(restored.ok && isAdjustmentsReported(restored.session)).toBe(true);
    expect(restored.ok && needsGuard(restored.session)).toBe(false);
  });
});

describe('both guards together', () => {
  it('unreported Counts and an Approved Adjustment both need the guard', () => {
    const s = approved(editTally(reportedSession(), B, 0, 91_000, AT));
    expect(canReplace(s)).toBe(false);
    expect(adjustmentsGuard(s).level).toBe('block');
    expect(needsGuard(s)).toBe(true);
  });

  it('unreported Counts alone still need it, as before', () => {
    const s = editTally(reportedSession(), B, 0, 91_000, AT);
    expect(adjustmentsGuard(s)).toEqual({ level: 'none' });
    expect(needsGuard(s)).toBe(true);
  });
});

describe('the wording', () => {
  it('describes what would be lost, factually', () => {
    expect(adjustmentsLine({ level: 'block', approved: 1, pending: 0, held: 0 })).toBe('1 Approved Adjustment that is not yet Applied');
    expect(adjustmentsLine({ level: 'block', approved: 2, pending: 0, held: 1 })).toBe('2 Approved Adjustments that are not yet Applied, and 1 on hold');
    expect(adjustmentsLine({ level: 'warn', approved: 0, pending: 1, held: 0 })).toBe('1 Adjustment with notes or decisions recorded, still Pending');
    expect(adjustmentsLine({ level: 'warn', approved: 0, pending: 0, held: 2 })).toBe('2 Adjustments on hold');
    expect(adjustmentsLine({ level: 'warn', approved: 0, pending: 2, held: 1 })).toBe('2 Adjustments with notes or decisions recorded, still Pending, and 1 on hold');
    expect(adjustmentsLine({ level: 'none' })).toBe('');
  });

  it('never blames anyone or talks about security', () => {
    const lines = [
      adjustmentsLine({ level: 'block', approved: 3, pending: 2, held: 1 }),
      adjustmentsLine({ level: 'warn', approved: 0, pending: 2, held: 1 }),
    ].join(' ');
    expect(lines).not.toMatch(/fraud|suspicious|tamper|secure|authori[sz]|verified/i);
  });
});
