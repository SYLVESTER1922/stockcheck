import { warningCounts, warningMessages, type Item } from './export';
import { isLarge, RECOUNT_LIST } from './large';
import { lineFor, type Session } from './session';

/** The Session Report model (spec §4.9). Integers throughout: thousandths and cents. */
export const SHORTAGE_NOTE =
  'A shortage may be stock on the shelf under a different name or not set up in Zobaze. ' +
  'Check the Recount List and the paper list before treating it as a loss.';

export type Status = 'MATCH' | 'SHORT' | 'OVER' | 'IN PROGRESS' | 'NOT COUNTED' | 'EXPECTED UNREADABLE';

export type ReportRow = {
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
  countAtLookAgain: number | null;
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
  warnings: string[];
  note: string;
};

export type Report = { summary: ReportSummary; detail: ReportRow[]; recount: ReportRow[] };
export type ReportMeta = { branch: string; counter: string; generatedAt: string };

export function buildReport(session: Session, meta: ReportMeta): Report {
  const detail = session.items.map((item) => toRow(session, item)).sort(byLossFirst);
  const recount = detail.filter((r) => r.recount);
  const sum = (values: (number | null)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0);
  const withVariance = detail.filter((r) => r.variance !== null);
  const shortRows = withVariance.filter((r) => r.variance! < 0);
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
      finished: detail.filter((r) => !['IN PROGRESS', 'NOT COUNTED'].includes(r.status)).length,
      inProgress: detail.filter((r) => r.status === 'IN PROGRESS').length,
      uncounted: detail.filter((r) => r.status === 'NOT COUNTED').length,
      matching: detail.filter((r) => r.status === 'MATCH').length,
      short: shortRows.length,
      over: overRows.length,
      unitsShort: sum(shortRows.map((r) => r.variance)),
      unitsOver: sum(overRows.map((r) => r.variance)),
      shortageValue: sum(shortRows.map((r) => r.value)),
      surplusValue: sum(overRows.map((r) => r.value)),
      netValue: sum(detail.map((r) => r.value)),
      promptedItems: Object.keys(session.countAtLookAgain).length,
      recountItems: recount.length,
      warnings: warningMessages(warningCounts(session.items)),
      note: SHORTAGE_NOTE,
    },
  };
}

function toRow(session: Session, item: Item): ReportRow {
  const line = lineFor(session, item);
  const countAtLookAgain = session.countAtLookAgain[item.key] ?? null;
  const base = {
    sessionStart: session.loadedAt,
    category: item.category,
    name: item.name,
    variant: item.variant,
    duplicate: item.duplicate,
    sku: item.sku,
    expected: item.expected,
    cost: item.cost,
    countAtLookAgain,
  };
  const itemFlags = [
    ...(item.flags.includes('negative-system-stock') ? ['Negative System Stock'] : []),
    ...(item.flags.includes('no-cost') ? ['No cost'] : []),
    ...(item.duplicate !== null ? ['Duplicate'] : []),
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
    flags: [...itemFlags, ...(endedAtExpected ? ['Ended exactly at Expected'] : [])],
    recount: isLarge({ variance: line.variance, value: line.value, expected: item.expected }, RECOUNT_LIST),
  };
}

// Rows with a value first (biggest loss first), then finished-without-value, in progress, Uncounted.
const RANK: Record<Status, number> = {
  SHORT: 0,
  MATCH: 0,
  OVER: 0,
  'EXPECTED UNREADABLE': 1,
  'IN PROGRESS': 2,
  'NOT COUNTED': 3,
};
const byLossFirst = (a: ReportRow, b: ReportRow) =>
  RANK[a.status] - RANK[b.status] || (a.value ?? 0) - (b.value ?? 0) || a.name.localeCompare(b.name);

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
