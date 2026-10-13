import { describe, expect, it } from 'vitest';
import type { Item } from '../src/domain/export';
import { buildReport } from '../src/domain/report';
import {
  addTally,
  finishItem,
  isReported,
  lineFor,
  markReported,
  newSession,
  removeTally,
  removeWastage,
  setWastage,
  type Session,
} from '../src/domain/session';
import { parseWastage, wastageFor, type WastageInput } from '../src/domain/wastage';

// T20, ADR 0007. Quantities are thousandths, so 100 units = 100_000.
const AT = '2026-10-06T06:45:00.000Z';
const LATER = '2026-10-06T08:00:00.000Z';
const item = (over: Partial<Item> = {}): Item => ({
  key: 'name:sugar|2kg',
  duplicate: null,
  name: 'Sugar',
  variant: '2kg',
  sku: '',
  category: '',
  expected: 100_000,
  cost: 150,
  flags: [],
  ...over,
});
const input = (over: Partial<WastageInput> = {}): WastageInput => ({
  quantity: '10',
  reason: 'Expired',
  note: '',
  register: 'R-12',
  confirmed: true,
  ...over,
});
const entry = (quantity: number) => {
  const result = parseWastage(input({ quantity: String(quantity / 1000) }), AT);
  if (!result.ok) throw new Error(result.message);
  return result.entry;
};
const counted = (thousandths: number, it = item()) =>
  finishItem(addTally(newSession('export.xlsx', AT, [it]), it, thousandths, AT), it, AT);
const withWastage = (session: Session, quantity: number, it = item()) => setWastage(session, it, entry(quantity));

describe('Wastage calculation', () => {
  it('Unexplained Variance is Total Variance plus Wastage: Expected 100, Count 85, Wastage 10', () => {
    const session = withWastage(counted(85_000), 10_000);
    expect(wastageFor(session, item())).toMatchObject({ total: -15_000, wastage: 10_000, unexplained: -5_000, flags: [] });
  });

  it('is exact with fractions', () => {
    const session = withWastage(counted(84_750), 0.125 * 1000);
    expect(wastageFor(session, item())).toMatchObject({ total: -15_250, unexplained: -15_125 });
  });

  it('has nothing for an Item with no Wastage', () => {
    expect(wastageFor(counted(85_000), item())).toBeNull();
  });
});

describe('Wastage only after Done', () => {
  it('cannot be recorded on an Uncounted Item', () => {
    const session = newSession('export.xlsx', AT, [item()]);
    expect(setWastage(session, item(), entry(10_000))).toBe(session);
  });

  it('cannot be recorded on an Item still in progress, and is never in a total for one', () => {
    const inProgress = addTally(newSession('export.xlsx', AT, [item()]), item(), 85_000, AT);
    expect(setWastage(inProgress, item(), entry(10_000))).toBe(inProgress);
    const forced: Session = { ...inProgress, wastage: { [item().key]: entry(10_000) } }; // e.g. left by another version
    expect(wastageFor(forced, item())).toBeNull();
  });

  it('cannot be recorded when Expected is unreadable, because there is no Variance to explain', () => {
    const unreadable = item({ expected: null });
    const session = counted(85_000, unreadable);
    expect(setWastage(session, unreadable, entry(10_000))).toBe(session);
  });
});

describe('Wastage entry rules', () => {
  const rejects = (over: Partial<WastageInput>) => {
    const result = parseWastage(input(over), AT);
    expect(result.ok).toBe(false);
    return result.ok ? '' : result.message;
  };

  it('accepts a full entry and keeps when it was entered', () => {
    expect(parseWastage(input({ quantity: '2,5', reason: 'Damaged', register: ' R-9 ' }), AT)).toEqual({
      ok: true,
      entry: { quantity: 2_500, reason: 'Damaged', note: '', register: 'R-9', notDeductedConfirmed: true, at: AT },
    });
  });

  it('needs a quantity above zero, with the Tally rules', () => {
    expect(rejects({ quantity: '' })).toBe('Type a number.');
    expect(rejects({ quantity: '-2' })).toBe("A count can't be negative.");
    expect(rejects({ quantity: '1.2345' })).toBe('Use at most 3 decimal places.');
    expect(rejects({ quantity: '0' })).toBe('Type a Wastage above 0, or remove the Wastage.');
  });

  it('needs a reason', () => {
    expect(rejects({ reason: '' })).toBe('Choose a reason.');
  });

  it('needs a note when the reason is Other, and only then', () => {
    expect(rejects({ reason: 'Other', note: '  ' })).toBe('Say what happened, for the reason Other.');
    expect(parseWastage(input({ reason: 'Other', note: ' Fell off the truck ' }), AT)).toMatchObject({ ok: true, entry: { note: 'Fell off the truck' } });
    expect(parseWastage(input({ reason: 'Spoilt', note: '' }), AT).ok).toBe(true);
  });

  it('needs the paper-register reference', () => {
    expect(rejects({ register: '   ' })).toBe('Type the paper-register reference.');
  });

  it('needs the tick that it is NOT already deducted in Zobaze', () => {
    expect(rejects({ confirmed: false })).toBe('Tick the box to confirm this is NOT already deducted in Zobaze.');
  });
});

describe('Wastage flags: shown, never a block', () => {
  const flagsFor = (count: number, wastage: number) => wastageFor(withWastage(counted(count), wastage), item())!.flags;

  it('flags Wastage larger than the shortage, because Unexplained turns into a surplus', () => {
    expect(flagsFor(85_000, 20_000)).toEqual(['exceeds-shortage']);
    expect(wastageFor(withWastage(counted(85_000), 20_000), item())).toMatchObject({ unexplained: 5_000 });
  });

  it('does not flag Wastage that is less than the shortage', () => {
    expect(flagsFor(85_000, 10_000)).toEqual([]);
    expect(flagsFor(85_000, 14_999)).toEqual([]);
  });

  it('flags Wastage that covers the whole shortage exactly, so Unexplained is 0', () => {
    expect(flagsFor(85_000, 15_000)).toEqual(['covers-shortage']);
    expect(wastageFor(withWastage(counted(85_000), 15_000), item())).toMatchObject({ unexplained: 0 });
    expect(flagsFor(84_750, 15_250)).toEqual(['covers-shortage']); // with fractions
  });

  it('flags exactly one of covers or exceeds, never both', () => {
    expect(flagsFor(85_000, 15_001)).toEqual(['exceeds-shortage']);
    expect(flagsFor(85_000, 15_000)).not.toContain('exceeds-shortage');
  });

  it('does not flag it for a surplus or a match, which have their own flags', () => {
    expect(flagsFor(105_000, 5_000)).toEqual(['on-surplus']);
    expect(flagsFor(100_000, 0.001 * 1000)).toEqual(['on-zero-variance']);
  });

  it('flags Wastage on an Item with a surplus, and the gap gets bigger', () => {
    expect(flagsFor(105_000, 2_000)).toEqual(['on-surplus']);
    expect(wastageFor(withWastage(counted(105_000), 2_000), item())).toMatchObject({ total: 5_000, unexplained: 7_000 });
  });

  it('flags Wastage on an Item that matches Expected', () => {
    expect(flagsFor(100_000, 2_000)).toEqual(['on-zero-variance']);
    expect(wastageFor(withWastage(counted(100_000), 2_000), item())).toMatchObject({ total: 0, unexplained: 2_000 });
  });

  it('still saves the Wastage that is flagged', () => {
    const session = withWastage(counted(100_000), 2_000);
    expect(session.wastage[item().key]).toBeDefined();
  });
});

describe('Wastage cannot hide a shortage', () => {
  // The main risk: Expected is visible after Done, so Wastage could be typed to cancel a shortage.
  // The ADR's answer is that Wastage never replaces the Total Variance. It sits beside it.
  const without = counted(85_000);
  const covering = withWastage(without, 15_000); // exactly the whole shortage

  it('leaves Count, Variance, Variance Value and Look Again exactly as they were', () => {
    expect(lineFor(covering, item())).toEqual(lineFor(without, item()));
    expect(lineFor(covering, item())).toMatchObject({ variance: -15_000, lookAgain: 'shortage' });
  });

  it('leaves the whole Session Report, totals and Recount List unchanged', () => {
    const meta = { branch: 'b', counter: 'c', generatedAt: AT };
    expect(buildReport(covering, meta)).toEqual(buildReport(without, meta));
    expect(buildReport(covering, meta).recount).toHaveLength(1);
    expect(buildReport(covering, meta).summary.netValue).toBe(-2250);
  });

  it('is only saved with a reason, a register reference and the tick', () => {
    expect(parseWastage(input({ register: '' }), AT).ok).toBe(false);
    expect(parseWastage(input({ reason: '' }), AT).ok).toBe(false);
    expect(parseWastage(input({ confirmed: false }), AT).ok).toBe(false);
  });

  it('keeps the Total Variance and the Wastage side by side, so the shortage is always visible', () => {
    expect(wastageFor(covering, item())).toMatchObject({ total: -15_000, wastage: 15_000, unexplained: 0 });
  });

  it('is flagged when it covers the whole shortage, and still saved', () => {
    expect(wastageFor(covering, item())!.flags).toEqual(['covers-shortage']);
    expect(covering.wastage[item().key]).toBeDefined();
  });

  it('is flagged as soon as it goes past the shortage', () => {
    expect(wastageFor(withWastage(without, 16_000), item())!.flags).toEqual(['exceeds-shortage']);
  });
});

describe('Editing and removing Wastage', () => {
  it('replaces the earlier entry', () => {
    const edited = withWastage(withWastage(counted(85_000), 10_000), 4_000);
    expect(wastageFor(edited, item())).toMatchObject({ wastage: 4_000, unexplained: -11_000 });
  });

  it('removing it leaves the Count and Total Variance, and Unexplained goes back to Total', () => {
    const base = counted(85_000);
    const removed = removeWastage(withWastage(base, 10_000), item());
    expect(wastageFor(removed, item())).toBeNull();
    expect(lineFor(removed, item())).toEqual(lineFor(base, item()));
    expect(removed.tallies).toEqual(base.tallies);
  });

  it('removing Wastage that is not there changes nothing', () => {
    const base = counted(85_000);
    expect(removeWastage(base, item())).toBe(base);
  });
});

describe('Wastage and the reported markers', () => {
  it('makes a reported Session unreported, without moving "Counting finished"', () => {
    const reported = markReported(counted(85_000));
    expect(isReported(reported)).toBe(true);
    const next = withWastage(reported, 10_000);
    expect(isReported(next)).toBe(false);
    expect(next.changes).toBe(reported.changes + 1);
    expect(next.lastChangeAt).toBe(reported.lastChangeAt);
  });

  it('removing it also marks the Session as changed', () => {
    const reported = markReported(withWastage(counted(85_000), 10_000));
    const next = removeWastage(reported, item());
    expect(isReported(next)).toBe(false);
    expect(next.lastChangeAt).toBe(reported.lastChangeAt);
  });

  it('does not touch the Adjustment markers', () => {
    const next = withWastage(counted(85_000), 10_000);
    expect(next.adjustmentChanges).toBe(0);
    expect(next.adjustmentsReportedChanges).toBeNull();
  });
});

describe('Wastage when Done is removed', () => {
  it('drops the live Wastage, and does not come back if the Item is counted again', () => {
    const it = item();
    const withW = withWastage(counted(85_000), 10_000);
    const removed = removeTally(withW, it, 0, LATER);
    expect(removed.wastage).toEqual({});
    const again = finishItem(addTally(removed, it, 85_000, LATER), it, LATER);
    expect(wastageFor(again, it)).toBeNull();
  });

  it('keeps Wastage when a Tally is edited and the Item stays Done', () => {
    const it = item();
    const base = finishItem(addTally(addTally(newSession('e.xlsx', AT, [it]), it, 50_000, AT), it, 35_000, AT), it, AT);
    const next = removeTally(withWastage(base, 10_000), it, 1, LATER);
    expect(wastageFor(next, it)).toMatchObject({ total: -50_000, wastage: 10_000, unexplained: -40_000 });
  });
});

describe('Wastage by Item', () => {
  const first = item({ key: 'name:sugar|2kg#1', duplicate: 1 });
  const second = item({ key: 'name:sugar|2kg#2', duplicate: 2, cost: 175 });
  const noSku = item({ key: 'name:oil|', name: 'Oil', variant: '' });

  it('belongs to one Item Key: a Duplicate Item or an Item without a SKU is separate', () => {
    let s = newSession('e.xlsx', AT, [first, second, noSku]);
    for (const it of [first, second, noSku]) s = finishItem(addTally(s, it, 85_000, AT), it, AT);
    s = setWastage(s, first, entry(10_000));
    expect(wastageFor(s, first)).toMatchObject({ wastage: 10_000 });
    expect(wastageFor(s, second)).toBeNull();
    expect(wastageFor(s, noSku)).toBeNull();
    s = setWastage(s, noSku, entry(3_000));
    expect(wastageFor(s, noSku)).toMatchObject({ wastage: 3_000, unexplained: -12_000 });
    expect(wastageFor(s, first)).toMatchObject({ wastage: 10_000 });
  });
});
