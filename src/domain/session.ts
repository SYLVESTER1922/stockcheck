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

/** One typed, timestamped step in an Adjustment's history (ADR 0007). */
export type AdjustmentLogEntry = { at: string; by: string; action: string; note: string };

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

const NEW_FIELDS = () => ({ wastage: {}, adjustments: {}, adjustmentChanges: 0, adjustmentsReportedChanges: null });

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
  return recordLookAgain(touched(next, at), item);
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
