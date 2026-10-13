import { describe, expect, it } from 'vitest';
import { adjustmentFor, setSupplierDocument, transition, type Adjustment } from '../src/domain/adjustments';
import { actionsFor, historyLine, sameName, type Action } from '../src/domain/adjustActions';
import type { Item } from '../src/domain/export';
import { addTally, finishItem, newSession, type AdjustmentStatus, type Session } from '../src/domain/session';

// T24, ADR 0007: which moves the screen offers. Buttons come from the STORED status; the rules are T22's.
const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, expected: number, cost = 150): Item => ({
  key,
  duplicate: null,
  name: key,
  variant: '',
  sku: '',
  category: '',
  expected,
  cost,
  flags: [],
});
const REMOVE = item('name:remove|', 10_000); // count 6 → REMOVE 4
const ADD = item('name:add|', 10_000); // count 14 → ADD 4

function session(): Session {
  let s = newSession('export.xlsx', AT, [REMOVE, ADD]);
  s = finishItem(addTally(s, REMOVE, 6_000, AT), REMOVE, AT);
  return finishItem(addTally(s, ADD, 14_000, AT), ADD, AT);
}
const FULL = { by: 'Mary', note: 'because', at: AT, appliedCheck: true };
const go = (s: Session, it: Item, to: AdjustmentStatus) => {
  const r = transition(s, it, { ...FULL, to });
  if (!r.ok) throw new Error(r.message);
  return r.session;
};
const withDoc = (s: Session) => {
  const r = setSupplierDocument(s, ADD, 'INV-1', 'Mary', AT);
  if (!r.ok) throw new Error(r.message);
  return r.session;
};
const labels = (a: Adjustment) => actionsFor(a).map((x) => x.label);
const at = (s: Session, it: Item) => adjustmentFor(s, it)!;

describe('the moves a row offers, from its STORED status', () => {
  it('Pending REMOVE: Approve, Reject, Put on hold', () => {
    expect(labels(at(session(), REMOVE))).toEqual(['Approve', 'Reject', 'Put on hold']);
  });

  it('Held REMOVE: Approve, Back to Pending, Reject', () => {
    expect(labels(at(go(session(), REMOVE, 'Held'), REMOVE))).toEqual(['Approve', 'Back to Pending', 'Reject']);
  });

  it('Rejected: only Reopen', () => {
    expect(labels(at(go(session(), REMOVE, 'Rejected'), REMOVE))).toEqual(['Reopen']);
  });

  it('Approved: Mark Applied, or Revoke approval', () => {
    expect(labels(at(go(session(), REMOVE, 'Approved'), REMOVE))).toEqual(['Mark Applied', 'Revoke approval']);
  });

  it('Applied: nothing at all, not even a Supplier Document change', () => {
    const applied = go(go(withDoc(session()), ADD, 'Approved'), ADD, 'Applied');
    expect(actionsFor(at(applied, ADD))).toEqual([]);
  });

  it('a REMOVE never offers a Supplier Document', () => {
    for (const s of [session(), go(session(), REMOVE, 'Held')]) expect(labels(at(s, REMOVE))).not.toContain('Add Supplier Document');
  });
});

describe('an ADD with no Supplier Document: shown as Held, but its buttons come from Pending', () => {
  const a = at(session(), ADD);

  it('is shown as Held while its stored status is Pending', () => {
    expect([a.status, a.storedStatus]).toEqual(['Held', 'Pending']);
  });

  it('offers the Pending moves and the Supplier Document, never Back to Pending, never Approve', () => {
    expect(labels(a)).toEqual(['Add Supplier Document', 'Reject', 'Put on hold']);
    expect(labels(a)).not.toContain('Back to Pending');
    expect(labels(a)).not.toContain('Approve');
  });

  it('offers Approve once the document is there, and then lets it be changed', () => {
    expect(labels(at(withDoc(session()), ADD))).toEqual(['Change Supplier Document', 'Approve', 'Reject', 'Put on hold']);
  });

  it('when put on hold by a person, its stored Held offers Back to Pending, still no Approve', () => {
    expect(labels(at(go(session(), ADD, 'Held'), ADD))).toEqual(['Add Supplier Document', 'Back to Pending', 'Reject']);
  });

  it('once Approved, the document cannot be changed', () => {
    expect(labels(at(go(withDoc(session()), ADD, 'Approved'), ADD))).toEqual(['Mark Applied', 'Revoke approval']);
  });
});

describe('what each move asks for', () => {
  const need = (s: Session, it: Item, label: string): Action => actionsFor(at(s, it)).find((x) => x.label === label)!;
  const approved = go(session(), REMOVE, 'Approved');

  it('Approve, Reject, Put on hold and Back to Pending ask for a name; a note is optional', () => {
    expect(need(session(), REMOVE, 'Approve')).toMatchObject({ kind: 'move', to: 'Approved', note: 'optional', appliedCheck: false });
    expect(need(session(), REMOVE, 'Reject')).toMatchObject({ to: 'Rejected', note: 'optional' });
    expect(need(session(), REMOVE, 'Put on hold')).toMatchObject({ to: 'Held', note: 'optional' });
    expect(need(go(session(), REMOVE, 'Held'), REMOVE, 'Back to Pending')).toMatchObject({ to: 'Pending', note: 'optional' });
  });

  it('Reopen and Revoke approval need a note', () => {
    expect(need(go(session(), REMOVE, 'Rejected'), REMOVE, 'Reopen')).toMatchObject({ to: 'Pending', note: 'required' });
    expect(need(approved, REMOVE, 'Revoke approval')).toMatchObject({ to: 'Pending', note: 'required' });
  });

  it('Mark Applied needs the Applied Check', () => {
    expect(need(approved, REMOVE, 'Mark Applied')).toMatchObject({ to: 'Applied', appliedCheck: true, note: 'optional' });
  });

  it('the Supplier Document move is its own kind', () => {
    expect(need(session(), ADD, 'Add Supplier Document')).toMatchObject({ kind: 'document' });
  });
});

describe('what is offered is exactly what the rules allow', () => {
  const STATUSES: AdjustmentStatus[] = ['Pending', 'Held', 'Rejected', 'Approved', 'Applied'];
  const reach = (status: AdjustmentStatus, it: Item, doc: boolean): Session => {
    let s = doc && it === ADD ? withDoc(session()) : session();
    if (status === 'Pending') return s;
    if (status === 'Applied') {
      if (it === ADD && !doc) s = withDoc(s);
      return go(go(s, it, 'Approved'), it, 'Applied');
    }
    if (status === 'Approved' && it === ADD && !doc) s = withDoc(s);
    return go(s, it, status);
  };
  const cases: [AdjustmentStatus, Item, boolean][] = [];
  for (const status of STATUSES) {
    cases.push([status, REMOVE, false]);
    cases.push([status, ADD, false]);
    cases.push([status, ADD, true]);
  }

  it.each(cases)('%s, %s, document %s: a target is offered if and only if the move is accepted', (status, it, doc) => {
    // An ADD with no document can only be Pending, Held or Rejected (it cannot have been Approved).
    if (it === ADD && !doc && (status === 'Approved' || status === 'Applied')) return;
    const s = reach(status, it, doc);
    const a = at(s, it);
    const offered = new Set(actionsFor(a).flatMap((x) => (x.kind === 'move' ? [x.to!] : [])));
    for (const to of ['Pending', 'Approved', 'Applied', 'Rejected', 'Held'] as AdjustmentStatus[]) {
      const result = transition(s, it, { ...FULL, to });
      expect(offered.has(to), `${status} ${it.key} → ${to}`).toBe(result.ok);
    }
  });
});

describe('the history lines: factual, and without security language', () => {
  const at1 = new Date(2026, 9, 7, 8, 0).toISOString();
  const line = (entry: Parameters<typeof historyLine>[0]) => historyLine(entry);

  it('says who did what, and when', () => {
    expect(line({ at: at1, by: 'Mary', action: 'Approved', note: '', from: 'Pending', to: 'Approved' })).toBe('Approved by Mary · 2026-10-07 08:00');
    expect(line({ at: at1, by: 'Joe', action: 'Applied', note: '', from: 'Approved', to: 'Applied' })).toBe('Applied by Joe · 2026-10-07 08:00');
    expect(line({ at: at1, by: 'Mary', action: 'Rejected', note: '', from: 'Pending', to: 'Rejected' })).toBe('Rejected by Mary · 2026-10-07 08:00');
    expect(line({ at: at1, by: 'Mary', action: 'Held', note: '', from: 'Pending', to: 'Held' })).toBe('Put on hold by Mary · 2026-10-07 08:00');
  });

  it('tells a revoke, a reopen and a return from hold apart', () => {
    expect(line({ at: at1, by: 'Mary', action: 'Pending', note: '', from: 'Approved', to: 'Pending' })).toBe('Approval revoked by Mary · 2026-10-07 08:00');
    expect(line({ at: at1, by: 'Mary', action: 'Pending', note: '', from: 'Rejected', to: 'Pending' })).toBe('Reopened by Mary · 2026-10-07 08:00');
    expect(line({ at: at1, by: 'Mary', action: 'Pending', note: '', from: 'Held', to: 'Pending' })).toBe('Moved back to Pending by Mary · 2026-10-07 08:00');
  });

  it('adds the note, and the Supplier Document', () => {
    expect(line({ at: at1, by: 'Mary', action: 'Rejected', note: 'Recount first', from: 'Pending', to: 'Rejected' })).toBe(
      'Rejected by Mary · 2026-10-07 08:00 · Recount first',
    );
    expect(line({ at: at1, by: 'Mary', action: 'Supplier Document', note: 'INV-204' })).toBe('Supplier Document INV-204 recorded by Mary · 2026-10-07 08:00');
  });

  it('never uses words like signed, authorised, verified or secure', () => {
    const all = ['Approved', 'Applied', 'Rejected', 'Held', 'Pending'].map((to) =>
      line({ at: at1, by: 'Mary', action: to, note: '', from: 'Approved', to: to as AdjustmentStatus }),
    );
    expect(all.join(' ')).not.toMatch(/signed|authori[sz]|verified|secure|certif/i);
  });
});

describe('the approver and the Counter', () => {
  it('match when the names are the same, ignoring case and spacing', () => {
    expect(sameName('Alex Moyo', 'alex  moyo ')).toBe(true);
    expect(sameName('Alex', 'Alexandra')).toBe(false);
  });

  it('never match an empty name, so there is no warning before a Counter is known', () => {
    expect(sameName('', '')).toBe(false);
    expect(sameName('Alex', '')).toBe(false);
    expect(sameName('Alex', undefined)).toBe(false);
  });
});
