import type { Item } from './export';
import { isLarge, LOOK_AGAIN } from './large';
import { varianceValue } from './money';

/** One Export plus the Tallies entered against it (CONTEXT: Session; ADR 0003, 0004). */
export type Session = {
  exportFileName: string;
  /** ISO time the Export was loaded: the Session start. */
  loadedAt: string;
  /** ISO time of the last Tally change: "counting finished". null until the first Tally. */
  lastChangeAt: string | null;
  items: Item[];
  /** Tallies in thousandths, by Item Key. An Item with no entry is Uncounted. */
  tallies: Record<string, number[]>;
  /** Items the Counter has marked Done. Only these reveal Expected and Variance. */
  finished: Record<string, true>;
  /** Count (thousandths) when Done was first tapped, before Expected was revealed. Never overwritten or cleared. */
  countAtDone: Record<string, number>;
  /** Count (thousandths) when Look Again first fired. Never overwritten or cleared. */
  countAtLookAgain: Record<string, number>;
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
    items,
    tallies: {},
    finished: {},
    countAtDone: {},
    countAtLookAgain: {},
  };
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
  return recordLookAgain({ ...session, finished: { ...session.finished, [item.key]: true }, countAtDone, lastChangeAt: at }, item);
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
  const next =
    tallies.length > 0
      ? { ...session, tallies: { ...session.tallies, [item.key]: tallies }, lastChangeAt: at }
      : { ...session, tallies: otherTallies, finished: otherFinished, lastChangeAt: at };
  return recordLookAgain(next, item);
}

/** The first time a finished Item has a large Variance, keep its Count on record (ADR 0004). */
function recordLookAgain(session: Session, item: Item): Session {
  if (item.key in session.countAtLookAgain) return session;
  const line = lineFor(session, item);
  if (line.status !== 'finished' || line.lookAgain === null) return session;
  return { ...session, countAtLookAgain: { ...session.countAtLookAgain, [item.key]: line.count } };
}
