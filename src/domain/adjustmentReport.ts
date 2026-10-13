import { adjustView, ITEM_FLAG_TEXT } from './adjustView';
import type { Adjustment } from './adjustments';
import { formatLocalTime, formatQuantity } from './format';
import type { AdjustmentLogEntry, AdjustmentStatus, Session } from './session';
import { WASTAGE_FLAG_LABEL } from './wastage';

/**
 * The Adjustment Report model (T27, ADR 0007): what the separate Excel file holds. Built from the
 * same derivation as the Adjust tab, so the screen and the file cannot disagree. Integers throughout:
 * thousandths and cents. It is a record, not security. StockCheck never changes Zobaze.
 */
export type AdjustmentReportMeta = { branch: string; counter: string; generatedAt: string };

export type AdjustmentReportRow = {
  id: string;
  name: string;
  variant: string;
  /** The SKU, or the Item Key where there is none. */
  skuOrKey: string;
  duplicate: number | null;
  cost: number;
  expected: number;
  count: number;
  wastage: number;
  /** Count − Expected (for a correcting Adjustment, the part not yet applied). */
  total: number;
  unexplained: number;
  action: 'ADD' | 'REMOVE';
  /** ADD positive, REMOVE negative. */
  quantity: number;
  /** The quantity at cost, signed, in cents. */
  value: number;
  status: AdjustmentStatus;
  approvedBy: string;
  approvedAt: string;
  supplierDocument: string;
  appliedBy: string;
  appliedAt: string;
  appliedCheck: boolean;
  flags: string;
  review: string;
  corrects: string;
  correctedBy: string;
  historyOnly: boolean;
};

export type AdjustmentHistoryRow = {
  at: string;
  name: string;
  variant: string;
  skuOrKey: string;
  id: string;
  event: string;
  by: string;
  note: string;
  from: string;
  to: string;
  countBefore: number | null;
  countAfter: number | null;
  countReviewed: number | null;
  appliedCheck: boolean;
};

export type ActionTotals = { adjustments: number; units: number; value: number };

export type AdjustmentReportSummary = {
  branch: string;
  counter: string;
  exportFileName: string;
  /** When the Export was loaded: every quantity is measured against it. */
  exportLoaded: string;
  generatedAt: string;
  byStatus: Record<AdjustmentStatus, number>;
  /** History of an Approval whose Adjustment is not live now. Not in the status counts or the totals. */
  historyOnly: number;
  /** Applied Adjustments whose Count has changed or been removed and nobody has reviewed. */
  needsReview: number;
  /** Rejected and history-only rows are not included. */
  totals: { add: ActionTotals; remove: ActionTotals; net: ActionTotals };
  note: string;
};

export type AdjustmentReport = { summary: AdjustmentReportSummary; rows: AdjustmentReportRow[]; history: AdjustmentHistoryRow[] };

export const ADJUSTMENT_REPORT_NOTE =
  'StockCheck never changes Zobaze: staff correct it by hand, then mark the Adjustment Applied. Check the current Zobaze balance first: ' +
  'quantities are measured against the Export loaded above. Approved by and Applied by are a record, not security: names are typed on a phone, ' +
  "times come from the phone's clock, and a backup file can be edited.";

export function buildAdjustmentReport(session: Session, meta: AdjustmentReportMeta): AdjustmentReport {
  const view = adjustView(session);
  const rows = view.list.map(toRow);
  const live = rows.filter((r) => !r.historyOnly);
  const byStatus: Record<AdjustmentStatus, number> = { Pending: 0, Approved: 0, Applied: 0, Rejected: 0, Held: 0 };
  for (const r of live) byStatus[r.status]++;

  const totalsOf = (list: AdjustmentReportRow[]): ActionTotals => ({
    adjustments: list.length,
    units: list.reduce((sum, r) => sum + r.quantity, 0),
    value: list.reduce((sum, r) => sum + r.value, 0),
  });
  const counted = live.filter((r) => r.status !== 'Rejected');

  return {
    summary: {
      branch: meta.branch,
      counter: meta.counter,
      exportFileName: session.exportFileName,
      exportLoaded: formatLocalTime(session.loadedAt),
      generatedAt: formatLocalTime(meta.generatedAt),
      byStatus,
      historyOnly: rows.length - live.length,
      needsReview: view.needsReview,
      totals: { add: totalsOf(counted.filter((r) => r.action === 'ADD')), remove: totalsOf(counted.filter((r) => r.action === 'REMOVE')), net: totalsOf(counted) },
      note: ADJUSTMENT_REPORT_NOTE,
    },
    rows,
    history: historyOf(session, rows),
  };
}

function toRow(a: Adjustment): AdjustmentReportRow {
  const applied = [...a.log].reverse().find((entry) => entry.to === 'Applied');
  const flags = [...a.itemFlags.flatMap((f) => (ITEM_FLAG_TEXT[f] ? [ITEM_FLAG_TEXT[f]] : [])), ...a.wastageFlags.map((f) => WASTAGE_FLAG_LABEL[f])];
  return {
    id: a.id,
    name: a.item.name,
    variant: a.item.variant,
    skuOrKey: a.item.sku || a.item.key,
    duplicate: a.item.duplicate,
    cost: a.item.cost,
    expected: a.expected,
    count: a.count,
    wastage: a.wastage,
    total: a.total,
    unexplained: a.unexplained,
    action: a.direction,
    quantity: a.direction === 'ADD' ? a.quantity : -a.quantity,
    value: a.value,
    status: a.status,
    approvedBy: a.approval?.by ?? '',
    approvedAt: a.approval ? formatLocalTime(a.approval.at) : '',
    supplierDocument: a.supplierDocument,
    appliedBy: a.applied?.by ?? '',
    appliedAt: a.applied ? formatLocalTime(a.applied.at) : '',
    appliedCheck: applied?.appliedCheck === true,
    flags: flags.join('; '),
    review: reviewText(a),
    corrects: a.linkedTo ?? '',
    correctedBy: a.correctedBy.map((c) => c.id).join('; '),
    historyOnly: a.gone !== null,
  };
}

/** What needs a person's attention on this row, in plain words. */
function reviewText(a: Adjustment): string {
  if (a.review) {
    const applied = formatQuantity(a.review.appliedCount);
    return a.review.reason === 'count-removed'
      ? `Count removed after Applied: review. It was applied with a Count of ${applied}; the Item has no Count now.`
      : `Count changed after Applied: review. It was applied with a Count of ${applied}; the Count is now ${formatQuantity(a.review.currentCount!)}.`;
  }
  if (a.gone === 'count-removed') return 'History only: the count was removed after it was approved, so the Approval was cancelled.';
  if (a.gone === 'count-changed') return 'History only: the Count changed, so there is no Adjustment now.';
  if (a.countChange) {
    const { from, to } = a.countChange;
    if (to === null) return 'Approval cancelled: the count was removed.';
    return `Approval cancelled: the Count changed${from === null ? '' : ` from ${formatQuantity(from)}`} to ${formatQuantity(to)}.`;
  }
  return '';
}

const AUTO = 'StockCheck (automatic)';

/** Every logged move and review action, grouped by Adjustment in the order of the Adjustments sheet, each in the order it happened. */
function historyOf(session: Session, rows: AdjustmentReportRow[]): AdjustmentHistoryRow[] {
  const order = new Map(rows.map((r, i) => [r.id, i]));
  const items = new Map(session.items.map((i) => [i.key, i]));
  const ids = Object.keys(session.adjustments).sort((a, b) => (order.get(a) ?? rows.length) - (order.get(b) ?? rows.length) || a.localeCompare(b));
  return ids.flatMap((id) => {
    const record = session.adjustments[id]!;
    const item = items.get(record.itemKey);
    return record.log.map((e) => ({
      at: formatLocalTime(e.at),
      name: item?.name ?? record.itemKey,
      variant: item?.variant ?? '',
      skuOrKey: item ? item.sku || item.key : record.itemKey,
      id,
      event: eventOf(e),
      by: e.auto ? AUTO : e.by,
      note: e.note,
      from: e.from ?? '',
      to: e.to ?? '',
      countBefore: e.countFrom ?? null,
      countAfter: e.countTo ?? null,
      countReviewed: e.reviewedCount ?? null,
      appliedCheck: e.appliedCheck === true,
    }));
  });
}

function eventOf(e: AdjustmentLogEntry): string {
  if (e.action === 'Supplier Document') return 'Supplier Document recorded';
  if (e.action === 'Acknowledged') return 'Acknowledged, no action needed';
  if (e.action === 'Correcting Adjustment raised') return e.action;
  if (e.auto) return e.action === 'Count changed' ? 'Count changed, so the Approval was cancelled' : e.to === 'Pending' ? 'Count removed, so the Approval was cancelled' : 'Count removed';
  switch (e.to) {
    case 'Approved':
      return 'Approved';
    case 'Applied':
      return 'Applied';
    case 'Rejected':
      return 'Rejected';
    case 'Held':
      return 'Put on hold';
    case 'Pending':
      return e.from === 'Approved' ? 'Approval revoked' : e.from === 'Rejected' ? 'Reopened' : 'Moved back to Pending';
    default:
      return e.action;
  }
}

/** stockcheck-adjustments-<branch>-<counter>-YYYY-MM-DD-HHmm.xlsx, in the phone's local time. */
export function adjustmentReportFileName(branch: string, counter: string, at: Date): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const time = `${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `stockcheck-adjustments-${slug(branch)}-${slug(counter)}-${date}-${time}.xlsx`;
}
