import type { Item } from './export';
import { varianceValue } from './money';

/** One Export plus the Tallies entered against it (CONTEXT: Session; ADR 0003). */
export type Session = {
  exportFileName: string;
  /** ISO time the Export was loaded: the Session start. */
  loadedAt: string;
  items: Item[];
  /** Tallies in thousandths, by Item Key. An Item with no entry is Uncounted. */
  tallies: Record<string, number[]>;
};

export type Line =
  | { counted: false }
  | { counted: true; tallies: number[]; count: number; variance: number | null; value: number | null };

export function newSession(exportFileName: string, loadedAt: string, items: Item[]): Session {
  return { exportFileName, loadedAt, items, tallies: {} };
}

export function addTally(session: Session, key: string, thousandths: number): Session {
  const existing = session.tallies[key] ?? [];
  return { ...session, tallies: { ...session.tallies, [key]: [...existing, thousandths] } };
}

/** Count, Variance and Variance Value are derived from the Tallies every time, never stored. */
export function lineFor(session: Session, item: Item): Line {
  const tallies = session.tallies[item.key];
  if (!tallies || tallies.length === 0) return { counted: false };
  const count = tallies.reduce((sum, t) => sum + t, 0);
  if (item.expected === null) return { counted: true, tallies, count, variance: null, value: null };
  const variance = count - item.expected;
  return { counted: true, tallies, count, variance, value: varianceValue(variance, item.cost) };
}
