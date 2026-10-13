import { describe, expect, it } from 'vitest';
import { hasApprovedAdjustment, raiseCorrection, setSupplierDocument, transition } from '../src/domain/adjustments';
import type { Item } from '../src/domain/export';
import { addTally, editTally, finishItem, newSession, removeTally, setWastage, type AdjustmentStatus, type Session } from '../src/domain/session';
import { parseWastage } from '../src/domain/wastage';

// The Count tab tells the Counter when changing a Count would cancel an Approval (ADR 0007).
const AT = '2026-10-06T06:45:00.000Z';
const item = (key: string, expected: number): Item => ({ key, duplicate: null, name: key, variant: '', sku: '', category: '', expected, cost: 150, flags: [] });
const SUGAR = item('sku:S1', 100_000); // count 85 → REMOVE 15
const OIL = item('sku:O1', 5_000); // count 8 → ADD 3

function session(): Session {
  let s = newSession('export.xlsx', AT, [SUGAR, OIL]);
  s = finishItem(addTally(s, SUGAR, 85_000, AT), SUGAR, AT);
  return finishItem(addTally(s, OIL, 8_000, AT), OIL, AT);
}
const ok = (r: ReturnType<typeof transition>) => {
  if (!r.ok) throw new Error(r.message);
  return r.session;
};
const move = (s: Session, it: Item, to: AdjustmentStatus, id?: string) => ok(transition(s, it, { to, by: 'Mary', note: 'n', at: AT, appliedCheck: true, id }));

describe('the Approved Adjustment hint', () => {
  it('shows for an Item whose Adjustment is Approved', () => {
    expect(hasApprovedAdjustment(move(session(), SUGAR, 'Approved'), SUGAR)).toBe(true);
  });

  it('does not show for an Item with no Adjustment, or an Adjustment that is not Approved', () => {
    expect(hasApprovedAdjustment(session(), SUGAR)).toBe(false); // Pending
    expect(hasApprovedAdjustment(move(session(), SUGAR, 'Held'), SUGAR)).toBe(false);
    expect(hasApprovedAdjustment(move(session(), SUGAR, 'Rejected'), SUGAR)).toBe(false);
    expect(hasApprovedAdjustment(move(move(session(), SUGAR, 'Approved'), SUGAR, 'Applied'), SUGAR)).toBe(false);
    expect(hasApprovedAdjustment(move(session(), SUGAR, 'Approved'), OIL)).toBe(false); // another Item
    expect(hasApprovedAdjustment(newSession('e.xlsx', AT, [SUGAR]), SUGAR)).toBe(false); // not counted
  });

  it('does not show for an Item that matches Expected (no Adjustment)', () => {
    const s = finishItem(addTally(newSession('e.xlsx', AT, [SUGAR]), SUGAR, 100_000, AT), SUGAR, AT);
    expect(hasApprovedAdjustment(s, SUGAR)).toBe(false);
  });

  it('goes away once the Count has changed, because the Approval is cancelled', () => {
    const approved = move(session(), SUGAR, 'Approved');
    expect(hasApprovedAdjustment(editTally(approved, SUGAR, 0, 88_000, AT), SUGAR)).toBe(false);
    expect(hasApprovedAdjustment(removeTally(approved, SUGAR, 0, AT), SUGAR)).toBe(false);
  });

  it('stays when only Wastage changes, because that does not cancel an Approval', () => {
    const r = parseWastage({ quantity: '4', reason: 'Expired', note: '', register: 'R-1', confirmed: true }, AT);
    if (!r.ok) throw new Error(r.message);
    expect(hasApprovedAdjustment(setWastage(move(session(), SUGAR, 'Approved'), SUGAR, r.entry), SUGAR)).toBe(true);
  });

  it('shows for an Approved correcting Adjustment too', () => {
    const applied = move(move(session(), SUGAR, 'Approved'), SUGAR, 'Applied');
    const changed = editTally(applied, SUGAR, 0, 88_000, AT);
    const raised = ok(raiseCorrection(changed, SUGAR, { by: 'Mary', note: 'n', at: AT }));
    expect(hasApprovedAdjustment(raised, SUGAR)).toBe(false); // raised, not yet Approved
    const doc = ok(setSupplierDocument(raised, SUGAR, 'INV-1', 'Mary', AT, 'sku:S1~2'));
    expect(hasApprovedAdjustment(move(doc, SUGAR, 'Approved', 'sku:S1~2'), SUGAR)).toBe(true);
  });

  it('does not show for a history-only row', () => {
    const s = removeTally(move(session(), SUGAR, 'Approved'), SUGAR, 0, AT); // count removed: history only
    expect(hasApprovedAdjustment(s, SUGAR)).toBe(false);
  });
});
