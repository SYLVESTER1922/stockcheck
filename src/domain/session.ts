import type { Item } from './export';
import { isLarge, LOOK_AGAIN } from './large';
import { varianceValue } from './money';

/** Documented Wastage for one Item, entered after Done (CONTEXT: Wastage; ADR 0007). */
export type WastageEntry = {
  /** Thousandths of a unit, zero or more. */
  quantity: number;
  reason: 'Expired' | 'Damaged' | 'Spoilt' | 'Other';
  note: string;
  /** Paper-register reference. */
  register: string;
  /** The Counter ticked "This is NOT already deducted in Zobaze". Always true: it is not saved without the tick. */
  notDeductedConfirmed: true;
  /** ISO time it was entered. */
  at: string;
};

export type AdjustmentStatus = 'Pending' | 'Approved' | 'Applied' | 'Rejected' | 'Held';

/** What an Approval agreed to (ADR 0007). Kept in the log, so a revoked Approval stays in the history. */
export type ApprovalSnapshot = {
  direction: 'ADD' | 'REMOVE';
  /** Always positive. */
  quantity: number;
  /** Count − Expected at the time. */
  total: number;
  count: number;
  expected: number;
  wastage: number;
  unexplained: number;
  supplierDocument: string;
};

/** One typed, timestamped step in an Adjustment's history (ADR 0007). */
export type AdjustmentLogEntry = {
  at: string;
  by: string;
  /** The status moved to, or 'Supplier Document'. */
  action: string;
  note: string;
  from?: AdjustmentStatus;
  to?: AdjustmentStatus;
  /** On a move to Approved. */
  snapshot?: ApprovalSnapshot;
  /** On a move to Applied: the Applied Check was ticked. */
  appliedCheck?: true;
  /** Made by StockCheck itself, not a person (a Count change or removal). `by` is empty. */
  auto?: true;
  /** For a Count change or removal: the Count at the last Approval, and the Count now (null: removed). */
  countFrom?: number;
  countTo?: number | null;
  /** For an Acknowledge or a correcting Adjustment: the Count that was reviewed (null: removed). */
  reviewedCount?: number | null;
  /** For a correcting Adjustment raised: the id of the new Adjustment. */
  linkedId?: string;
};

/** An Adjustment that has been acted on. An Item with no record is Pending (ADR 0007). */
export type AdjustmentRecord = {
  itemKey: string;
  status: AdjustmentStatus;
  supplierDocument: string;
  /** The id of the Applied Adjustment this one corrects; null otherwise. */
  linkedTo: string | null;
  log: AdjustmentLogEntry[];
};

/** One Export plus the Tallies entered against it (CONTEXT: Session; ADR 0003, 0004). */
export type Session = {
  exportFileName: string;
  /** ISO time the Export was loaded: the Session start. */
  loadedAt: string;
  /** ISO time of the last Tally change: "counting finished". null until the first Tally. */
  lastChangeAt: string | null;
  /** Bumped on every Tally change (add, edit, remove, Done). */
  changes: number;
  /** The `changes` value the last downloaded report covered; null if never reported. */
  reportedChanges: number | null;
  items: Item[];
  /** Tallies in thousandths, by Item Key. An Item with no entry is Uncounted. */
  tallies: Record<string, number[]>;
  /** Items the Counter has marked Done. Only these reveal Expected and Variance. */
  finished: Record<string, true>;
  /** Count (thousandths) when Done was first tapped, before Expected was revealed. Never overwritten or cleared. */
  countAtDone: Record<string, number>;
  /** Count (thousandths) when Look Again first fired. Never overwritten or cleared. */
  countAtLookAgain: Record<string, number>;
  /** Wastage by Item Key (ADR 0007). Added after the pilot began: absent in older saves. */
  wastage: Record<string, WastageEntry>;
  /** Adjustment records by id (ADR 0007). Absent in older saves. */
  adjustments: Record<string, AdjustmentRecord>;
  /** Bumped on every Adjustment workflow change; never moves `changes` or `lastChangeAt`. */
  adjustmentChanges: number;
  /** The `adjustmentChanges` value the last Adjustment Report covered; null if never downloaded. */
  adjustmentsReportedChanges: number | null;
  /** The Counter's typed name, '' until known (ADR 0007). Metadata: it moves no marker. */
  counter: string;
};

export type Line =
  | { status: 'uncounted' }
  | { status: 'in-progress'; tallies: number[]; count: number }
  | {
      status: 'finished';
      tallies: number[];
      count: number;
      variance: number | null;
      value: number | null;
      lookAgain: 'shortage' | 'surplus' | null;
      countAtLookAgain: number | null;
    };

export function newSession(exportFileName: string, loadedAt: string, items: Item[]): Session {
  return {
    exportFileName,
    loadedAt,
    lastChangeAt: null,
    changes: 0,
    reportedChanges: null,
    items,
    tallies: {},
    finished: {},
    countAtDone: {},
    countAtLookAgain: {},
    ...NEW_FIELDS(),
  };
}

const NEW_FIELDS = () => ({ wastage: {}, adjustments: {}, adjustmentChanges: 0, adjustmentsReportedChanges: null, counter: '' });

/**
 * A saved or restored Session may lack fields added since it was written; they get their empty
 * default and everything else is kept as it was. Used by loading and by restoring (ADR 0007).
 */
export function withSessionDefaults(saved: Partial<Session>): Session {
  return {
    lastChangeAt: null,
    changes: 0,
    reportedChanges: null,
    finished: {},
    countAtDone: {},
    countAtLookAgain: {},
    ...NEW_FIELDS(),
    ...saved,
  } as Session;
}

/** Keeps the Counter's name on the Session. Not a Count or an Adjustment change, so no marker moves. */
export function setCounter(session: Session, name: string): Session {
  const counter = name.trim();
  return counter === session.counter ? session : { ...session, counter };
}

/** Another place: add a Tally. Done = addTally (if typed) + finishItem. */
export function addTally(session: Session, item: Item, thousandths: number, at: string): Session {
  return setTallies(session, item, [...(session.tallies[item.key] ?? []), thousandths], at);
}

export function editTally(session: Session, item: Item, index: number, thousandths: number, at: string): Session {
  const tallies = (session.tallies[item.key] ?? []).map((t, i) => (i === index ? thousandths : t));
  return setTallies(session, item, tallies, at);
}

export function removeTally(session: Session, item: Item, index: number, at: string): Session {
  return setTallies(session, item, (session.tallies[item.key] ?? []).filter((_, i) => i !== index), at);
}

export function finishItem(session: Session, item: Item, at: string): Session {
  const tallies = session.tallies[item.key];
  if (!tallies?.length) return session;
  const countAtDone =
    item.key in session.countAtDone
      ? session.countAtDone
      : { ...session.countAtDone, [item.key]: tallies.reduce((sum, t) => sum + t, 0) };
  const next: Session = { ...session, finished: { ...session.finished, [item.key]: true as const }, countAtDone };
  return recordLookAgain(touched(next, at), item);
}

/** Count, Variance and Variance Value are derived from the Tallies every time, never stored. */
export function lineFor(session: Session, item: Item): Line {
  const tallies = session.tallies[item.key];
  if (!tallies?.length) return { status: 'uncounted' };
  const count = tallies.reduce((sum, t) => sum + t, 0);
  if (!session.finished[item.key]) return { status: 'in-progress', tallies, count };

  const countAtLookAgain = session.countAtLookAgain[item.key] ?? null;
  if (item.expected === null) {
    return { status: 'finished', tallies, count, variance: null, value: null, lookAgain: null, countAtLookAgain };
  }
  const variance = count - item.expected;
  const value = varianceValue(variance, item.cost);
  const large = isLarge({ variance, value, expected: item.expected }, LOOK_AGAIN);
  const lookAgain = large ? (variance < 0 ? 'shortage' : 'surplus') : null;
  return { status: 'finished', tallies, count, variance, value, lookAgain, countAtLookAgain };
}

function setTallies(session: Session, item: Item, tallies: number[], at: string): Session {
  const { [item.key]: _removed, ...otherTallies } = session.tallies;
  const { [item.key]: _wasFinished, ...otherFinished } = session.finished;
  // Done is removed with the last Tally, and the live Wastage goes with it (ADR 0007).
  const { [item.key]: _wastage, ...otherWastage } = session.wastage;
  const next =
    tallies.length > 0
      ? { ...session, tallies: { ...session.tallies, [item.key]: tallies } }
      : { ...session, tallies: otherTallies, finished: otherFinished, wastage: otherWastage };
  return reconcileAdjustments(recordLookAgain(touched(next, at), item), item, at);
}

/** What the last Approval agreed to: the snapshot on the last move to Approved. */
export const approvedSnapshot = (record: AdjustmentRecord): ApprovalSnapshot | undefined =>
  [...record.log].reverse().find((entry) => entry.to === 'Approved')?.snapshot;

/** An Approval or an Applied mark is on record, even if it was revoked since. That history is kept. */
export const hasApprovalHistory = (record: AdjustmentRecord): boolean => record.log.some((entry) => entry.to === 'Approved' || entry.to === 'Applied');

/**
 * What a Count change or removal does to this Item's Adjustments (ADR 0007), logged as an automatic entry:
 * - Approved: back to Pending, the Approval stays in the log. Editing the Tally back restores nothing.
 * - Applied: never changed. A removal is noted on its log; a change is shown as a review flag (derived).
 * - Pending, Held, Rejected: dropped when Done is removed, unless an Approval is in their history.
 */
function reconcileAdjustments(session: Session, item: Item, at: string): Session {
  const ids = Object.keys(session.adjustments).filter((id) => session.adjustments[id]!.itemKey === item.key);
  if (ids.length === 0) return session;
  const line = lineFor(session, item);
  const count = line.status === 'finished' ? line.count : null;
  const next = { ...session.adjustments };
  let changed = false;

  for (const id of ids) {
    const record = next[id]!;
    const snapshot = approvedSnapshot(record);
    const alreadyNoted = record.log.at(-1)?.auto === true && record.log.at(-1)?.action === 'Count removed';
    if (record.status === 'Approved') {
      if (count !== null && (!snapshot || snapshot.count === count)) continue;
      const entry: AdjustmentLogEntry = {
        at,
        by: '',
        auto: true,
        action: count === null ? 'Count removed' : 'Count changed',
        note: '',
        from: 'Approved',
        to: 'Pending',
        ...(snapshot ? { countFrom: snapshot.count } : {}),
        countTo: count,
      };
      next[id] = { ...record, status: 'Pending', log: [...record.log, entry] };
      changed = true;
    } else if (count === null) {
      if (record.status === 'Applied' || hasApprovalHistory(record)) {
        if (alreadyNoted) continue;
        const entry: AdjustmentLogEntry = { at, by: '', auto: true, action: 'Count removed', note: '', ...(snapshot ? { countFrom: snapshot.count } : {}), countTo: null };
        next[id] = { ...record, log: [...record.log, entry] };
      } else {
        delete next[id];
      }
      changed = true;
    }
  }
  return changed ? { ...session, adjustments: next, adjustmentChanges: session.adjustmentChanges + 1 } : session;
}

/**
 * Wastage changes the Session Report, so the Session counts as changed since its last report, but
 * counting did not happen, so `lastChangeAt` ("Counting finished") stays where it was (ADR 0007).
 */
const changedWithoutCounting = (session: Session): Session => ({ ...session, changes: session.changes + 1 });

/** Records Wastage for a Done Item with a readable Expected. Anything else is ignored. */
export function setWastage(session: Session, item: Item, entry: WastageEntry): Session {
  const line = lineFor(session, item);
  if (line.status !== 'finished' || line.variance === null) return session;
  return changedWithoutCounting({ ...session, wastage: { ...session.wastage, [item.key]: entry } });
}

export function removeWastage(session: Session, item: Item): Session {
  if (!(item.key in session.wastage)) return session;
  const { [item.key]: _removed, ...others } = session.wastage;
  return changedWithoutCounting({ ...session, wastage: others });
}

const touched = (session: Session, at: string): Session => ({ ...session, lastChangeAt: at, changes: session.changes + 1 });

// Reload guard (spec §4.8, ADR 0003).
export const hasCounts = (session: Session) => Object.keys(session.tallies).length > 0;
export const isReported = (session: Session) => session.reportedChanges === session.changes;
export const markReported = (session: Session): Session => ({ ...session, reportedChanges: session.changes });

/** A new Export or a restore may replace this Session without losing unreported Counts. */
export function canReplace(session: Session): boolean {
  return !hasCounts(session) || isReported(session);
}

/** The first time a finished Item has a large Variance, keep its Count on record (ADR 0004). */
function recordLookAgain(session: Session, item: Item): Session {
  if (item.key in session.countAtLookAgain) return session;
  const line = lineFor(session, item);
  if (line.status !== 'finished' || line.lookAgain === null) return session;
  return { ...session, countAtLookAgain: { ...session.countAtLookAgain, [item.key]: line.count } };
}
