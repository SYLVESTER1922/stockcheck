import { describe, expect, it } from 'vitest';
import {
  adjustmentFor,
  deriveAdjustments,
  setSupplierDocument,
  transition,
  type TransitionInput,
} from '../src/domain/adjustments';
import { parseBackup, toBackup } from '../src/domain/backup';
import type { Item } from '../src/domain/export';
import { buildReport } from '../src/domain/report';
import {
  addTally,
  finishItem,
  isReported,
  lineFor,
  markReported,
  newSession,
  setWastage,
  withSessionDefaults,
  type AdjustmentStatus,
  type Session,
} from '../src/domain/session';
import { parseWastage } from '../src/domain/wastage';

// T22, ADR 0007. Quantities are thousandths and money is cents: 100 units = 100_000.
const AT = '2026-10-06T06:45:00.000Z';
const T1 = '2026-10-07T08:00:00.000Z';
const T2 = '2026-10-07T09:30:00.000Z';

const item = (key: string, expected: number | null, cost: number, over: Partial<Item> = {}): Item => ({
  key,
  duplicate: null,
  name: key.replace(/^[a-z]+:/, ''),
  variant: '',
  sku: '',
  category: '',
  expected,
  cost,
  flags: [],
  ...over,
});

const I = {
  short: item('sku:S1', 100_000, 150, { name: 'Sugar', sku: 'S1' }), // count 85 → −15: REMOVE 15
  over: item('sku:O1', 5_000, 200, { name: 'Oil', sku: 'O1' }), // count 8 → +3: ADD 3
  match: item('name:salt|', 3_000, 100), // count 3 → 0
  negative: item('name:soap|', -5_000, 100, { flags: ['negative-system-stock'] }), // count 0 → +5: ADD 5
  blank: item('name:tea|', 0, 100, { flags: ['blank-expected'] }), // count 5 → ADD 5
  dupA: item('name:rice|#1', 10_000, 150, { name: 'Rice', duplicate: 1, flags: ['negative-system-stock'] }), // count 9 → −1
  dupB: item('name:rice|#2', 10_000, 175, { name: 'Rice', duplicate: 2 }), // count 12 → +2
  noSku: item('name:flour|2kg', 7_000, 300, { name: 'Flour', variant: '2kg' }), // count 6 → −1
  progress: item('name:jam|', 8_000, 100), // Another place only
  uncounted: item('name:honey|', 2_000, 100),
  unreadable: item('name:salt2|', null, 100, { flags: ['unreadable-expected'] }), // Done, no Variance
};

function session(): Session {
  let s = newSession('export.xlsx', '2026-10-06T06:30:00.000Z', Object.values(I));
  const done = (it: Item, ...tallies: number[]) => {
    for (const t of tallies) s = addTally(s, it, t, AT);
    s = finishItem(s, it, AT);
  };
  done(I.short, 85_000);
  done(I.over, 8_000);
  done(I.match, 3_000);
  done(I.negative, 0);
  done(I.blank, 5_000);
  done(I.dupA, 9_000);
  done(I.dupB, 12_000);
  done(I.noSku, 6_000);
  s = addTally(s, I.progress, 2_000, AT);
  done(I.unreadable, 1_000);
  return s;
}

const wasted = (s: Session, it: Item, quantity: string) => {
  const r = parseWastage({ quantity, reason: 'Expired', note: '', register: 'R-1', confirmed: true }, AT);
  if (!r.ok) throw new Error(r.message);
  return setWastage(s, it, r.entry);
};

const FULL: TransitionInput = { to: 'Approved', by: 'Mary', note: 'because', at: T1, appliedCheck: true };
const ok = (r: ReturnType<typeof transition>): Session => {
  if (!r.ok) throw new Error(`expected success, refused: ${r.message}`);
  return r.session;
};
const move = (s: Session, it: Item, to: AdjustmentStatus, over: Partial<TransitionInput> = {}) =>
  ok(transition(s, it, { ...FULL, to, ...over }));
const statusOf = (s: Session, it: Item) => adjustmentFor(s, it)!.status;

describe('which Items have an Adjustment', () => {
  const view = deriveAdjustments(session());
  const names = view.list.map((a) => a.item.key);

  it('is every Done Item with a non-zero Total Variance and a readable Expected', () => {
    expect(names).toEqual([I.short, I.over, I.negative, I.blank, I.dupA, I.dupB, I.noSku].map((i) => i.key));
  });

  it('has none for Uncounted, In progress, zero-variance or unreadable-Expected Items', () => {
    for (const it of [I.uncounted, I.progress, I.match, I.unreadable]) expect(adjustmentFor(session(), it)).toBeNull();
  });

  it('says how many Items were left out, and why', () => {
    expect(view.leftOut).toEqual({ uncounted: 1, inProgress: 1, expectedUnreadable: 1 });
    expect(view.matching).toBe(1);
  });

  it('is nothing for a Session with no Counts', () => {
    const empty = deriveAdjustments(newSession('e.xlsx', AT, [I.short, I.over]));
    expect(empty.list).toEqual([]);
    expect(empty.leftOut).toEqual({ uncounted: 2, inProgress: 0, expectedUnreadable: 0 });
  });
});

describe('direction, quantity and split', () => {
  it('is ADD above Expected and REMOVE below, with the quantity equal to the Total Variance', () => {
    expect(adjustmentFor(session(), I.short)).toMatchObject({ direction: 'REMOVE', quantity: 15_000, total: -15_000, count: 85_000, expected: 100_000 });
    expect(adjustmentFor(session(), I.over)).toMatchObject({ direction: 'ADD', quantity: 3_000, total: 3_000, count: 8_000, expected: 5_000 });
  });

  it('values the Total Variance at cost in integer cents', () => {
    expect(adjustmentFor(session(), I.short)!.value).toBe(-2_250);
    expect(adjustmentFor(session(), I.over)!.value).toBe(600);
  });

  it('splits into documented Wastage and Unexplained, without changing the quantity', () => {
    const before = adjustmentFor(session(), I.short)!;
    const after = adjustmentFor(wasted(session(), I.short, '10'), I.short)!;
    expect(after).toMatchObject({ direction: 'REMOVE', quantity: 15_000, total: -15_000, wastage: 10_000, unexplained: -5_000 });
    expect(after.value).toBe(before.value);
    expect(after.unexplainedValue).toBe(-750);
    expect(before).toMatchObject({ wastage: 0, unexplained: -15_000, unexplainedValue: -2_250 });
  });

  it('carries the Wastage flags', () => {
    expect(adjustmentFor(wasted(session(), I.short, '20'), I.short)!.wastageFlags).toEqual(['exceeds-shortage']);
    expect(adjustmentFor(wasted(session(), I.over, '1'), I.over)!.wastageFlags).toEqual(['on-surplus']);
  });

  it('never changes Variance, Look Again or the Session Report', () => {
    const plain = session();
    const withW = wasted(plain, I.short, '15');
    expect(lineFor(withW, I.short)).toEqual(lineFor(plain, I.short));
    const meta = { branch: 'b', counter: 'c', generatedAt: AT };
    expect(buildReport(withW, meta).summary.netValue).toBe(buildReport(plain, meta).summary.netValue);
  });
});

describe('Items that need care', () => {
  it('Negative System Stock gives the correct delta: Expected −5, Count 0 is ADD 5', () => {
    expect(adjustmentFor(session(), I.negative)).toMatchObject({ direction: 'ADD', quantity: 5_000, expected: -5_000, count: 0 });
    expect(adjustmentFor(session(), I.negative)!.itemFlags).toEqual(['negative-system-stock']);
  });

  it('a blank Expected is treated as 0, and keeps its flag', () => {
    expect(adjustmentFor(session(), I.blank)).toMatchObject({ direction: 'ADD', quantity: 5_000, expected: 0 });
    expect(adjustmentFor(session(), I.blank)!.itemFlags).toEqual(['blank-expected']);
  });

  it('Duplicate Items get separate Adjustments, with their own cost', () => {
    const a = adjustmentFor(session(), I.dupA)!;
    const b = adjustmentFor(session(), I.dupB)!;
    expect([a.id, b.id]).toEqual(['name:rice|#1', 'name:rice|#2']);
    expect([a.direction, a.quantity, a.value]).toEqual(['REMOVE', 1_000, -150]);
    expect([b.direction, b.quantity, b.value]).toEqual(['ADD', 2_000, 350]);
    const s = move(session(), I.dupA, 'Rejected');
    expect(statusOf(s, I.dupA)).toBe('Rejected');
    expect(statusOf(s, I.dupB)).toBe('Held'); // an ADD with no Supplier Document: untouched
  });

  it('an Item without a SKU is keyed by name and Variant, and has its own Adjustment', () => {
    expect(adjustmentFor(session(), I.noSku)).toMatchObject({ id: 'name:flour|2kg', direction: 'REMOVE', quantity: 1_000 });
  });
});

describe('statuses', () => {
  it('no record means Pending', () => {
    expect(adjustmentFor(session(), I.short)).toMatchObject({ status: 'Pending', storedStatus: 'Pending', approval: null, applied: null, log: [] });
    expect(session().adjustments).toEqual({});
  });

  it('is derived: nothing is stored until somebody acts', () => {
    const s = session();
    deriveAdjustments(s);
    expect(s.adjustments).toEqual({});
  });
});

const STATUSES: AdjustmentStatus[] = ['Pending', 'Approved', 'Applied', 'Rejected', 'Held'];
const ALLOWED: Record<AdjustmentStatus, AdjustmentStatus[]> = {
  Pending: ['Approved', 'Rejected', 'Held'],
  Held: ['Pending', 'Approved', 'Rejected'],
  Rejected: ['Pending'],
  Approved: ['Applied', 'Pending'],
  Applied: [],
};
/** A REMOVE Adjustment (no Supplier Document needed) brought to a status by legal moves only. */
function reach(status: AdjustmentStatus, it = I.short): Session {
  const s = session();
  switch (status) {
    case 'Pending':
      return s;
    case 'Held':
    case 'Rejected':
    case 'Approved':
      return move(s, it, status);
    case 'Applied':
      return move(move(s, it, 'Approved'), it, 'Applied', { at: T2 });
  }
}

describe('every transition, allowed or refused (25 pairs)', () => {
  for (const from of STATUSES) {
    for (const to of STATUSES) {
      const allowed = ALLOWED[from].includes(to);
      it(`${from} → ${to} is ${allowed ? 'allowed' : 'refused'}`, () => {
        const start = reach(from);
        const result = transition(start, I.short, { ...FULL, to });
        if (allowed) {
          expect(result.ok).toBe(true);
          expect(statusOf(ok(result), I.short)).toBe(to);
        } else {
          expect(result).toMatchObject({ ok: false, reason: 'not-allowed' });
          expect(result.ok ? null : result.message).toBeTruthy();
        }
      });
    }
  }

  it('a refusal leaves the Session exactly as it was', () => {
    const start = reach('Approved');
    const result = transition(start, I.short, { ...FULL, to: 'Rejected' });
    expect(result.ok).toBe(false);
    expect(start.adjustmentChanges).toBe(1);
    expect(start.adjustments[I.short.key]!.log).toHaveLength(1);
  });

  it('skipping Approval is refused with a message that says to approve first', () => {
    const result = transition(session(), I.short, { ...FULL, to: 'Applied' });
    expect(result).toMatchObject({ ok: false, reason: 'not-allowed' });
    expect(result.ok ? '' : result.message).toMatch(/approve/i);
  });
});

describe('notes, names and the Applied Check', () => {
  it('reopening a Rejected Adjustment needs a note', () => {
    expect(transition(reach('Rejected'), I.short, { ...FULL, to: 'Pending', note: '  ' })).toMatchObject({ ok: false, reason: 'note-required' });
    expect(statusOf(move(reach('Rejected'), I.short, 'Pending', { note: 'Recount done' }), I.short)).toBe('Pending');
  });

  it('revoking an Approval needs a note', () => {
    expect(transition(reach('Approved'), I.short, { ...FULL, to: 'Pending', note: '' })).toMatchObject({ ok: false, reason: 'note-required' });
    expect(statusOf(move(reach('Approved'), I.short, 'Pending', { note: 'Wrong Item' }), I.short)).toBe('Pending');
  });

  it('Held → Pending needs no note', () => {
    expect(statusOf(move(reach('Held'), I.short, 'Pending', { note: '' }), I.short)).toBe('Pending');
  });

  it('an empty name is refused, for every move', () => {
    for (const by of ['', '   ']) {
      expect(transition(session(), I.short, { ...FULL, to: 'Approved', by })).toMatchObject({ ok: false, reason: 'name-required' });
      expect(transition(reach('Approved'), I.short, { ...FULL, to: 'Applied', by })).toMatchObject({ ok: false, reason: 'name-required' });
    }
  });

  it('Applied needs the Applied Check tick', () => {
    const approved = reach('Approved');
    expect(transition(approved, I.short, { ...FULL, to: 'Applied', appliedCheck: false })).toMatchObject({ ok: false, reason: 'applied-check-required' });
    expect(transition(approved, I.short, { to: 'Applied', by: 'Joe', note: '', at: T2 })).toMatchObject({ ok: false, reason: 'applied-check-required' });
  });

  it('the tick is not needed for any other move', () => {
    expect(transition(session(), I.short, { to: 'Approved', by: 'Mary', note: '', at: T1 }).ok).toBe(true);
  });
});

describe('the log', () => {
  it('appends every move with the time, the typed name and the note, trimmed', () => {
    let s = move(session(), I.short, 'Held', { by: ' Mary ', note: ' check ', at: T1 });
    s = move(s, I.short, 'Pending', { by: 'Mary', note: '', at: T2 });
    expect(s.adjustments[I.short.key]!.log).toEqual([
      { at: T1, by: 'Mary', action: 'Held', note: 'check', from: 'Pending', to: 'Held' },
      { at: T2, by: 'Mary', action: 'Pending', note: '', from: 'Held', to: 'Pending' },
    ]);
  });

  it('Applied records who applied it and when, and that the check was ticked', () => {
    const s = move(reach('Approved'), I.short, 'Applied', { by: 'Joe', at: T2 });
    expect(adjustmentFor(s, I.short)).toMatchObject({ status: 'Applied', applied: { by: 'Joe', at: T2 } });
    expect(s.adjustments[I.short.key]!.log.at(-1)).toMatchObject({ to: 'Applied', by: 'Joe', appliedCheck: true });
  });
});

describe('Approval', () => {
  it('stores a snapshot of the Total Variance, quantity, direction, Wastage split and Count', () => {
    const s = move(wasted(session(), I.short, '10'), I.short, 'Approved', { by: 'Mary', at: T1 });
    expect(adjustmentFor(s, I.short)!.approval).toEqual({
      by: 'Mary',
      at: T1,
      snapshot: { direction: 'REMOVE', quantity: 15_000, total: -15_000, count: 85_000, expected: 100_000, wastage: 10_000, unexplained: -5_000, supplierDocument: '' },
    });
  });

  it('keeps the snapshot after a revoke, in the log, and takes a new one on re-approval', () => {
    let s = move(reach('Approved'), I.short, 'Pending', { note: 'Wrong Item', at: T2 });
    expect(adjustmentFor(s, I.short)!.approval).toBeNull();
    expect(s.adjustments[I.short.key]!.log[0]!.snapshot).toMatchObject({ quantity: 15_000 });
    s = move(wasted(s, I.short, '4'), I.short, 'Approved', { at: T2 });
    expect(adjustmentFor(s, I.short)!.approval!.snapshot).toMatchObject({ wastage: 4_000, unexplained: -11_000 });
    expect(s.adjustments[I.short.key]!.log).toHaveLength(3);
  });

  it('is not shown for an Adjustment that is only Pending, Held or Rejected', () => {
    for (const status of ['Held', 'Rejected'] as const) expect(adjustmentFor(reach(status), I.short)!.approval).toBeNull();
  });
});

describe('ADD needs a Supplier Document', () => {
  it('an ADD with no document is Held, with nothing stored', () => {
    const a = adjustmentFor(session(), I.over)!;
    expect(a).toMatchObject({ direction: 'ADD', status: 'Held', storedStatus: 'Pending', needsSupplierDocument: true });
  });

  it('cannot be Approved, from Pending or from Held', () => {
    expect(transition(session(), I.over, { ...FULL, to: 'Approved' })).toMatchObject({ ok: false, reason: 'supplier-document-required' });
    const held = move(session(), I.over, 'Held');
    expect(transition(held, I.over, { ...FULL, to: 'Approved' })).toMatchObject({ ok: false, reason: 'supplier-document-required' });
  });

  it('can still be Rejected or Held while the document is missing', () => {
    expect(statusOf(move(session(), I.over, 'Rejected'), I.over)).toBe('Rejected');
    expect(statusOf(move(session(), I.over, 'Held'), I.over)).toBe('Held');
  });

  it('adding the document lets it leave Held and be Approved', () => {
    const withDoc = ok(setSupplierDocument(session(), I.over, ' INV-204 ', 'Mary', T1));
    expect(adjustmentFor(withDoc, I.over)).toMatchObject({ status: 'Pending', supplierDocument: 'INV-204', needsSupplierDocument: false });
    const approved = move(withDoc, I.over, 'Approved');
    expect(adjustmentFor(approved, I.over)!.approval!.snapshot.supplierDocument).toBe('INV-204');
  });

  it('adding the document to a manually Held ADD lets it be Approved straight away', () => {
    let s = move(session(), I.over, 'Held');
    s = ok(setSupplierDocument(s, I.over, 'DN-9', 'Mary', T1));
    expect(statusOf(s, I.over)).toBe('Held');
    expect(statusOf(move(s, I.over, 'Approved'), I.over)).toBe('Approved');
  });

  it('is logged', () => {
    const s = ok(setSupplierDocument(session(), I.over, 'INV-204', 'Mary', T1));
    expect(s.adjustments[I.over.key]!.log).toEqual([{ at: T1, by: 'Mary', action: 'Supplier Document', note: 'INV-204' }]);
  });

  it('a REMOVE never needs one', () => {
    expect(adjustmentFor(session(), I.short)).toMatchObject({ needsSupplierDocument: false, status: 'Pending' });
    expect(setSupplierDocument(session(), I.short, 'INV-1', 'Mary', T1)).toMatchObject({ ok: false, reason: 'document-not-needed' });
  });

  it('is refused when empty, or without a name', () => {
    expect(setSupplierDocument(session(), I.over, '  ', 'Mary', T1)).toMatchObject({ ok: false, reason: 'supplier-document-required' });
    expect(setSupplierDocument(session(), I.over, 'INV-1', ' ', T1)).toMatchObject({ ok: false, reason: 'name-required' });
  });

  it('cannot be changed once Approved, Applied or Rejected', () => {
    const base = ok(setSupplierDocument(session(), I.over, 'INV-1', 'Mary', T1));
    for (const to of ['Approved', 'Rejected'] as const) {
      const s = move(base, I.over, to);
      expect(setSupplierDocument(s, I.over, 'INV-2', 'Mary', T2)).toMatchObject({ ok: false, reason: 'not-allowed' });
    }
    const applied = move(move(base, I.over, 'Approved'), I.over, 'Applied', { at: T2 });
    const result = setSupplierDocument(applied, I.over, 'INV-2', 'Mary', T2);
    expect(result).toMatchObject({ ok: false, reason: 'not-allowed' });
    expect(adjustmentFor(applied, I.over)!.supplierDocument).toBe('INV-1');
  });
});

describe('Applied is final', () => {
  const applied = reach('Applied');

  it('refuses every further move and leaves the record untouched', () => {
    for (const to of STATUSES) expect(transition(applied, I.short, { ...FULL, to })).toMatchObject({ ok: false, reason: 'not-allowed' });
    expect(applied.adjustments[I.short.key]!.status).toBe('Applied');
  });

  it('keeps its Approval and Applied records', () => {
    expect(adjustmentFor(applied, I.short)).toMatchObject({ status: 'Applied', approval: { by: 'Mary' }, applied: { by: 'Mary', at: T2 } });
  });
});

describe('Items with no Adjustment', () => {
  it('refuse every move: Uncounted, In progress, matching, Expected unreadable', () => {
    for (const it of [I.uncounted, I.progress, I.match, I.unreadable]) {
      expect(transition(session(), it, { ...FULL, to: 'Approved' })).toMatchObject({ ok: false, reason: 'no-adjustment' });
      expect(setSupplierDocument(session(), it, 'INV-1', 'Mary', T1)).toMatchObject({ ok: false, reason: 'no-adjustment' });
    }
  });
});

describe('the markers', () => {
  it('a workflow change bumps only the Adjustment marker', () => {
    const before = markReported(session());
    const after = move(before, I.short, 'Approved');
    expect(after.adjustmentChanges).toBe(before.adjustmentChanges + 1);
    expect(after.changes).toBe(before.changes);
    expect(after.lastChangeAt).toBe(before.lastChangeAt);
    expect(after.reportedChanges).toBe(before.reportedChanges);
    expect(isReported(after)).toBe(true);
    expect(after.adjustmentsReportedChanges).toBe(before.adjustmentsReportedChanges);
  });

  it('a supplier-document change also bumps only the Adjustment marker', () => {
    const before = markReported(session());
    const after = ok(setSupplierDocument(before, I.over, 'INV-1', 'Mary', T1));
    expect([after.adjustmentChanges, after.changes, isReported(after)]).toEqual([1, before.changes, true]);
  });
});

describe('stored records are the only extra data', () => {
  it('a Session with Approvals round-trips through a backup, and the list is the same afterwards', () => {
    let s = move(reach('Applied'), I.negative, 'Held');
    s = ok(setSupplierDocument(s, I.over, 'INV-1', 'Mary', T1));
    s = move(s, I.over, 'Approved');
    const restored = parseBackup(toBackup(s, { savedAt: T2 }));
    expect(restored).toEqual({ ok: true, session: s });
    if (restored.ok) expect(deriveAdjustments(restored.session)).toEqual(deriveAdjustments(s));
  });

  it('Counts and Wastage are not copied into the records', () => {
    const s = move(wasted(session(), I.short, '10'), I.short, 'Held');
    const { itemKey, status, supplierDocument, linkedTo, log } = s.adjustments[I.short.key]!;
    expect({ itemKey, status, supplierDocument, linkedTo }).toEqual({ itemKey: I.short.key, status: 'Held', supplierDocument: '', linkedTo: null });
    expect(log).toHaveLength(1);
    expect(Object.keys(s.adjustments[I.short.key]!).sort()).toEqual(['itemKey', 'linkedTo', 'log', 'status', 'supplierDocument']);
  });
});

describe('a Session saved before ADR 0007 (the T19 compatible old shape)', () => {
  const OLD_SHAPE = {
    exportFileName: 'export.xlsx',
    loadedAt: '2026-10-06T06:30:00.000Z',
    lastChangeAt: AT,
    changes: 3,
    reportedChanges: 2,
    items: [I.short, I.over, I.match],
    tallies: { [I.short.key]: [50_000, 35_000], [I.over.key]: [8_000], [I.match.key]: [3_000] },
    finished: { [I.short.key]: true as const, [I.over.key]: true as const, [I.match.key]: true as const },
    countAtDone: { [I.short.key]: 85_000, [I.over.key]: 8_000, [I.match.key]: 3_000 },
    countAtLookAgain: {},
  };

  it('derives its Adjustments, all Pending (or Held for the ADD), with nothing stored', () => {
    const loaded = withSessionDefaults(OLD_SHAPE);
    const view = deriveAdjustments(loaded);
    expect(view.list.map((a) => [a.item.key, a.direction, a.quantity, a.status])).toEqual([
      [I.short.key, 'REMOVE', 15_000, 'Pending'],
      [I.over.key, 'ADD', 3_000, 'Held'],
    ]);
    expect(view.matching).toBe(1);
    expect(loaded.adjustments).toEqual({});
  });

  it('can be approved and applied, and its Counts and reported markers are untouched', () => {
    const loaded = withSessionDefaults(OLD_SHAPE);
    const done = move(move(loaded, I.short, 'Approved'), I.short, 'Applied', { at: T2 });
    expect(statusOf(done, I.short)).toBe('Applied');
    expect(done.tallies).toEqual(OLD_SHAPE.tallies);
    expect([done.changes, done.reportedChanges, done.lastChangeAt]).toEqual([3, 2, AT]);
    expect(done.adjustmentChanges).toBe(2);
  });

  it('survives a format 1 backup of itself', () => {
    const v1 = JSON.stringify({ app: 'stockcheck', format: 1, savedAt: AT, session: OLD_SHAPE });
    const result = parseBackup(v1);
    expect(result.ok).toBe(true);
    if (result.ok) expect(adjustmentFor(result.session, I.short)).toMatchObject({ direction: 'REMOVE', quantity: 15_000 });
  });
});
