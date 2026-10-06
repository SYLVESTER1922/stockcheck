import type { Report, ReportRow } from './report';

/**
 * The Variance tab (T17). Every figure is read from buildReport, the same function behind the
 * Excel Summary, so the screen and the file can never disagree. Only Done Items count.
 */
export function varianceView(report: Report) {
  const s = report.summary;
  return {
    hero: { net: s.netValue, short: s.shortageValue, over: s.surplusValue, expectedValueCounted: s.expectedValueCounted },
    tiles: {
      short: { lines: s.short, units: s.unitsShort },
      over: { lines: s.over, units: s.unitsOver },
      match: s.matching,
      notCounted: s.uncounted,
    },
    inProgress: s.inProgress,
    note: s.note,
  };
}

export type GapRanking = 'value' | 'units';
export type Gap = {
  key: string;
  name: string;
  variant: string;
  expected: number;
  count: number;
  cost: number;
  variance: number;
  value: number;
  direction: 'short' | 'over';
  countAtDone: number | null;
  countAtLookAgain: number | null;
  /** This gap's size relative to the largest in the list, 0–1, for the bar. */
  fraction: number;
};

const MAX_GAPS = 20;

/** Done Items with a non-zero Variance, largest first by $ value or by units. Never in-progress Items. */
export function biggestGaps(report: Report, by: GapRanking): Gap[] {
  const size = (r: ReportRow) => Math.abs((by === 'value' ? r.value : r.variance) ?? 0);
  const rows = report.detail
    .filter((r) => (r.status === 'SHORT' || r.status === 'OVER') && r.variance !== null && r.value !== null)
    .sort((a, b) => size(b) - size(a) || a.name.localeCompare(b.name))
    .slice(0, MAX_GAPS);
  const largest = rows.length > 0 ? size(rows[0]!) : 0;
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    variant: r.variant,
    expected: r.expected!,
    count: r.count!,
    cost: r.cost,
    variance: r.variance!,
    value: r.value!,
    direction: r.variance! < 0 ? 'short' : 'over',
    countAtDone: r.countAtDone,
    countAtLookAgain: r.countAtLookAgain,
    fraction: largest === 0 ? 0 : size(r) / largest,
  }));
}
