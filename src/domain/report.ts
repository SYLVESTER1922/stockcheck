import { warningCounts, warningMessages, type Item } from './export';
import { isLarge, RECOUNT_LIST } from './large';
import { valueAtCost } from './money';
import { lineFor, type Session } from './session';

/** The Session Report model (spec §4.9). Integers throughout: thousandths and cents. */
export const SHORTAGE_NOTE =
  'A shortage may be stock on the shelf under a different name or not set up in Zobaze. ' +
  'Check the Recount List and the paper list before treating it as a loss.';

export type Status = 'MATCH' | 'SHORT' | 'OVER' | 'IN PROGRESS' | 'NOT COUNTED' | 'EXPECTED UNREADABLE';

export type ReportRow = {
  key: string;
  sessionStart: string;
  category: string;
  name: string;
  variant: string;
  duplicate: number | null;
  sku: string;
  expected: number | null;
  count: number | null;
  variance: number | null;
  cost: number;
  value: number | null;
  status: Status;
  countAtDone: number | null;
  countAtLookAgain: number | null;
  /** Look Again fired for this Item at some point in the Session. */
  lookAgainPrompted: boolean;
  /** Prompted, Done, and the final Count equals Expected exactly. */
  endedAtExpected: boolean;
  flags: string[];
  /** Finished with a Variance large enough for the Recount List. */
  recount: boolean;
};

export type ReportSummary = {
  branch: string;
  counter: string;
  exportFileName: string;
  sessionStart: string;
  countingFinished: string | null;
  generatedAt: string;
  items: number;
  finished: number;
  inProgress: number;
  uncounted: number;
  matching: number;
  short: number;
  over: number;
  unitsShort: number;
  unitsOver: number;
  shortageValue: number;
  surplusValue: number;
  /** The headline: the sum of every row's Variance Value. */
  netValue: number;
  promptedItems: number;
  recountItems: number;
  /** Finished Items ÷ Items in the Export (0–1). */
  percentCounted: number;
  /** Expected × cost over finished Items with a readable Expected, in cents. */
  expectedValueCounted: number;
  /** netValue ÷ expectedValueCounted, or null when that value is 0. */
  netPercentOfExpected: number | null;
  byCategory: CategoryLine[];
  topShortages: ReportRow[];
  topOverages: ReportRow[];
  warnings: string[];
  note: string;
};

export type CategoryLine = { category: string; counted: number; units: number; value: number };

const TOP = 10;

export type Report = { summary: ReportSummary; detail: ReportRow[]; recount: ReportRow[] };
export type ReportMeta = { branch: string; counter: string; generatedAt: string };

export function buildReport(session: Session, meta: ReportMeta): Report {
  const detail = session.items.map((item) => toRow(session, item)).sort(byLargestValueFirst);
  const recount = detail.filter((r) => r.recount);
  const sum = (values: (number | null)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0);
  const withVariance = detail.filter((r) => r.variance !== null);
  const shortRows = withVariance.filter((r) => r.variance! < 0);
  const inProgress = detail.filter((r) => r.status === 'IN PROGRESS').length;
  const finishedRows = detail.filter((r) => !['IN PROGRESS', 'NOT COUNTED'].includes(r.status));
  const netValue = sum(detail.map((r) => r.value));
  const expectedValueCounted = sum(
    finishedRows.map((r) => (r.expected === null ? 0 : valueAtCost(r.expected, r.cost))),
  );
  const overRows = withVariance.filter((r) => r.variance! > 0);

  return {
    detail,
    recount,
    summary: {
      ...meta,
      exportFileName: session.exportFileName,
      sessionStart: session.loadedAt,
      countingFinished: session.lastChangeAt,
      items: detail.length,
      finished: finishedRows.length,
      inProgress,
      uncounted: detail.filter((r) => r.status === 'NOT COUNTED').length,
      matching: detail.filter((r) => r.status === 'MATCH').length,
      short: shortRows.length,
      over: overRows.length,
      unitsShort: sum(shortRows.map((r) => r.variance)),
      unitsOver: sum(overRows.map((r) => r.variance)),
      shortageValue: sum(shortRows.map((r) => r.value)),
      surplusValue: sum(overRows.map((r) => r.value)),
      netValue,
      promptedItems: Object.keys(session.countAtLookAgain).length,
      recountItems: recount.length,
      percentCounted: detail.length === 0 ? 0 : finishedRows.length / detail.length,
      expectedValueCounted,
      netPercentOfExpected: expectedValueCounted === 0 ? null : netValue / expectedValueCounted,
      byCategory: byCategory(finishedRows),
      topShortages: shortRows.slice().sort((a, b) => a.value! - b.value!).slice(0, TOP),
      topOverages: overRows.slice().sort((a, b) => b.value! - a.value!).slice(0, TOP),
      warnings: [...warningMessages(warningCounts(session.items)), ...inProgressWarning(inProgress)],
      note: SHORTAGE_NOTE,
    },
  };
}

function inProgressWarning(n: number): string[] {
  if (n === 0) return [];
  const subject = n === 1 ? '1 item is' : `${n} items are`;
  const pronoun = n === 1 ? 'it shows' : 'they show';
  return [`${subject} In progress (Done not tapped), so ${pronoun} no Variance and ${n === 1 ? 'is' : 'are'} not in the totals.`];
}

function byCategory(rows: ReportRow[]): CategoryLine[] {
  const lines = new Map<string, CategoryLine>();
  for (const r of rows) {
    const category = r.category || '(none)';
    const line = lines.get(category) ?? { category, counted: 0, units: 0, value: 0 };
    line.counted++;
    line.units += r.variance ?? 0;
    line.value += r.value ?? 0;
    lines.set(category, line);
  }
  return [...lines.values()].sort((a, b) => a.value - b.value || a.category.localeCompare(b.category));
}

function toRow(session: Session, item: Item): ReportRow {
  const line = lineFor(session, item);
  const countAtLookAgain = session.countAtLookAgain[item.key] ?? null;
  const base = {
    key: item.key,
    lookAgainPrompted: countAtLookAgain !== null,
    endedAtExpected: false,
    sessionStart: session.loadedAt,
    category: item.category,
    name: item.name,
    variant: item.variant,
    duplicate: item.duplicate,
    sku: item.sku,
    expected: item.expected,
    cost: item.cost,
    countAtDone: session.countAtDone[item.key] ?? null,
    countAtLookAgain,
  };
  const itemFlags = [
    ...(item.flags.includes('negative-system-stock') ? ['Negative System Stock'] : []),
    ...(item.flags.includes('no-cost') ? ['No cost'] : []),
    ...(item.duplicate !== null ? ['Duplicate Item'] : []),
  ];

  if (line.status === 'uncounted') {
    return { ...base, count: null, variance: null, value: null, status: 'NOT COUNTED', flags: itemFlags, recount: false };
  }
  if (line.status === 'in-progress') {
    const flags = [...itemFlags, 'In progress: Done not tapped'];
    return { ...base, count: line.count, variance: null, value: null, status: 'IN PROGRESS', flags, recount: false };
  }
  if (line.variance === null || line.value === null || item.expected === null) {
    const status = 'EXPECTED UNREADABLE';
    return { ...base, count: line.count, variance: null, value: null, status, flags: itemFlags, recount: false };
  }

  const status = line.variance === 0 ? 'MATCH' : line.variance < 0 ? 'SHORT' : 'OVER';
  const endedAtExpected = countAtLookAgain !== null && line.variance === 0;
  return {
    ...base,
    count: line.count,
    variance: line.variance,
    value: line.value,
    status,
    endedAtExpected,
    flags: [...itemFlags, ...(endedAtExpected ? ['Ended exactly at Expected'] : [])],
    recount: isLarge({ variance: line.variance, value: line.value, expected: item.expected }, RECOUNT_LIST),
  };
}

// Rows with a value first (largest absolute $ first, T15), then finished-without-value, in progress, Uncounted.
const RANK: Record<Status, number> = {
  SHORT: 0,
  MATCH: 0,
  OVER: 0,
  'EXPECTED UNREADABLE': 1,
  'IN PROGRESS': 2,
  'NOT COUNTED': 3,
};
const byLargestValueFirst = (a: ReportRow, b: ReportRow) =>
  RANK[a.status] - RANK[b.status] || Math.abs(b.value ?? 0) - Math.abs(a.value ?? 0) || a.name.localeCompare(b.name);

/** stockcheck-<branch>-<counter>-YYYY-MM-DD-HHmm.xlsx, in the phone's local time. */
export function reportFileName(branch: string, counter: string, at: Date): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `stockcheck-${slug(branch)}-${slug(counter)}-${date}-${time}.xlsx`;
}
