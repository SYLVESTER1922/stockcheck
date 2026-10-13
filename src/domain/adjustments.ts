import type { Item, ItemFlag } from './export';
import { valueAtCost } from './money';
import {
  approvedSnapshot,
  hasApprovalHistory,
  lineFor,
  type AdjustmentLogEntry,
  type AdjustmentRecord,
  type AdjustmentStatus,
  type ApprovalSnapshot,
  type Session,
} from './session';
import { wastageFor, type WastageFlag } from './wastage';

/**
 * Adjustments (CONTEXT: Adjustment; ADR 0007). A recommendation to correct one Item's balance in
 * Zobaze by hand. A live Adjustment is DERIVED from the Tallies and Wastage every time: quantity,
 * direction and split are never stored. Only what people decided is stored, as an AdjustmentRecord
 * with its log: the status, the Supplier Document, and each Approval's snapshot (inside its log
 * entry). An Applied record, and the history of an Approval, are shown as they were recorded:
 * they never disappear when the Count changes. Netrisyl never updates Zobaze.
 */
export type Direction = 'ADD' | 'REMOVE';

/** An Applied Adjustment whose Item's Count has changed or been removed since: needs a person to look. */
export type Review = {
  reason: 'count-changed' | 'count-removed';
  /** The Count when it was applied, and the Count now (null: Done was removed). */
  appliedCount: number;
  currentCount: number | null;
  /** A correcting Adjustment can be raised: there is a Count, and it differs from what was applied. */
  canCorrect: boolean;
  /** What a correcting Adjustment would be, signed: the new Total Variance minus what has been applied. Null if no Count. */
  correction: number | null;
};

export type Adjustment = {
  /** The Item Key for the first Adjustment of an Item; `<Item Key>~2`, `~3`… for correcting ones. */
  id: string;
  item: Item;
  itemFlags: ItemFlag[];
  direction: Direction;
  /** The Total Variance as a positive quantity (thousandths). What staff type into Zobaze. */
  quantity: number;
  /** Count − Expected, signed. For a correcting Adjustment: the part not yet applied. */
  total: number;
  count: number;
  expected: number;
  /** Documented Wastage (0 if none) and the Total Variance + Wastage. Wastage never changes the quantity. */
  wastage: number;
  unexplained: number;
  wastageFlags: WastageFlag[];
  /** Total Variance at cost, and Unexplained at cost: signed cents. */
  value: number;
  unexplainedValue: number;
  /** As shown: an ADD with no Supplier Document that is not otherwise decided shows as Held. */
  status: AdjustmentStatus;
  /** What was last decided by a person; Pending if nothing was. */
  storedStatus: AdjustmentStatus;
  supplierDocument: string;
  /** An ADD with no Supplier Document: it cannot be Approved. */
  needsSupplierDocument: boolean;
  /** The current Approval, while the Adjustment is Approved or Applied. */
  approval: { by: string; at: string; snapshot: ApprovalSnapshot } | null;
  applied: { by: string; at: string } | null;
  log: AdjustmentLogEntry[];
  kind: 'primary' | 'correcting';
  /** For a correcting Adjustment: the id of the Applied one it corrects. */
  linkedTo: string | null;
  corrects: { id: string; direction: Direction; quantity: number; by: string; at: string } | null;
  correctedBy: { id: string; direction: Direction; quantity: number; status: AdjustmentStatus }[];
  /** Set on the Applied Adjustment (the latest for its Item) when its Count changed and nobody has reviewed it. */
  review: Review | null;
  /** After an automatic Approval cancel: the Count at the Approval and the Count then (null: removed). */
  countChange: { from: number | null; to: number | null } | null;
  /** History only: the quantities are the last Approval's, and nothing can be done with it. */
  gone: 'count-removed' | 'count-changed' | null;
};

export type AdjustmentsView = {
  list: Adjustment[];
  /** Items that cannot have an Adjustment yet, and why. */
  leftOut: { uncounted: number; inProgress: number; expectedUnreadable: number };
  /** Done Items with a Total Variance of 0: nothing to adjust. */
  matching: number;
  /** Applied Adjustments whose Count has changed or been removed and who nobody has reviewed. */
  needsReview: number;
};

export function deriveAdjustments(session: Session): AdjustmentsView {
  const byItem = new Map<string, [string, AdjustmentRecord][]>();
  for (const [id, record] of Object.entries(session.adjustments)) {
    const list = byItem.get(record.itemKey) ?? [];
    list.push([id, record]);
    byItem.set(record.itemKey, list);
  }

  const view: AdjustmentsView = { list: [], leftOut: { uncounted: 0, inProgress: 0, expectedUnreadable: 0 }, matching: 0, needsReview: 0 };
  for (const item of session.items) {
    const line = lineFor(session, item);
    if (line.status === 'uncounted') view.leftOut.uncounted++;
    else if (line.status === 'in-progress') view.leftOut.inProgress++;
    else if (line.variance === null) view.leftOut.expectedUnreadable++;
    else if (line.variance === 0) view.matching++;
    const records = byItem.get(item.key);
    if (!records && (line.status !== 'finished' || line.variance === null || line.variance === 0)) continue;
    view.list.push(...rowsForItem(session, item, records ?? []));
  }
  view.needsReview = view.list.filter((a) => a.review !== null).length;
  return view;
}

/** Every Adjustment row of one Item: its first one, any correcting ones, and history. */
export function adjustmentsOf(session: Session, item: Item): Adjustment[] {
  const records = Object.entries(session.adjustments).filter(([, record]) => record.itemKey === item.key);
  return rowsForItem(session, item, records);
}

/** The Item's first Adjustment (or the one with `id`), or null. */
export function adjustmentFor(session: Session, item: Item, id: string = item.key): Adjustment | null {
  return adjustmentsOf(session, item).find((a) => a.id === id) ?? null;
}

/** True while changing this Item's Count would cancel an Approval (the Count tab says so). */
export function hasApprovedAdjustment(session: Session, item: Item): boolean {
  return adjustmentsOf(session, item).some((a) => a.storedStatus === 'Approved' && a.gone === null);
}

// ---- derivation ----

const suffix = (id: string) => Number(/~(\d+)$/.exec(id)?.[1] ?? 0);
const lastLog = (record: AdjustmentRecord, to: AdjustmentStatus) => [...record.log].reverse().find((entry) => entry.to === to);
const approvalOf = (record: AdjustmentRecord) => {
  const entry = lastLog(record, 'Approved');
  return entry?.snapshot ? { by: entry.by, at: entry.at, snapshot: entry.snapshot } : null;
};

function rowsForItem(session: Session, item: Item, found: [string, AdjustmentRecord][]): Adjustment[] {
  const line = lineFor(session, item);
  const count = line.status === 'finished' ? line.count : null;
  const total = line.status === 'finished' ? line.variance : null;
  const records = [...found].sort(([a], [b]) => (a === item.key ? -1 : b === item.key ? 1 : suffix(a) - suffix(b)));
  const appliedNet = records
    .filter(([, r]) => r.status === 'Applied')
    .reduce((sum, [, r]) => sum + (approvedSnapshot(r)?.total ?? 0), 0);
  const rows: Adjustment[] = [];

  if (!records.some(([id]) => id === item.key) && total !== null && total !== 0) {
    rows.push(liveRow(session, item, item.key, null, total, count!));
  }
  for (const [id, record] of records) {
    if (record.status === 'Applied') {
      rows.push(appliedRow(item, id, record));
      continue;
    }
    const primary = id === item.key;
    const live = total === null ? null : primary ? total : total - appliedNet;
    if (live !== null && live !== 0) rows.push(liveRow(session, item, id, record, live, count!));
    else if (hasApprovalHistory(record)) rows.push(ghostRow(item, id, record, count === null ? 'count-removed' : 'count-changed'));
  }

  // The review flag belongs to the latest Applied Adjustment of the Item only.
  const latest = [...records].reverse().find(([, r]) => r.status === 'Applied');
  if (latest) {
    const [id, record] = latest;
    const review = reviewOf(records, id, record, count, total === null ? null : total - appliedNet);
    const row = rows.find((r) => r.id === id);
    if (row) row.review = review;
  }
  for (const row of rows) {
    if (row.linkedTo === null) continue;
    const target = rows.find((r) => r.id === row.linkedTo);
    if (!target) continue;
    row.corrects = { id: target.id, direction: target.direction, quantity: target.quantity, by: target.applied?.by ?? '', at: target.applied?.at ?? '' };
    target.correctedBy.push({ id: row.id, direction: row.direction, quantity: row.quantity, status: row.status });
  }
  return rows;
}

function reviewOf(records: [string, AdjustmentRecord][], id: string, record: AdjustmentRecord, count: number | null, residual: number | null): Review | null {
  const appliedCount = approvedSnapshot(record)?.count;
  if (appliedCount === undefined || count === appliedCount) return null;
  const reviewed = [...record.log].reverse().find((entry) => entry.reviewedCount !== undefined);
  if (reviewed && reviewed.reviewedCount === count) return null;
  const open = records.some(([, r]) => r.linkedTo === id && (r.status === 'Pending' || r.status === 'Held' || r.status === 'Approved'));
  if (open) return null;
  return {
    reason: count === null ? 'count-removed' : 'count-changed',
    appliedCount,
    currentCount: count,
    canCorrect: count !== null && residual !== null && residual !== 0,
    correction: count === null ? null : residual,
  };
}

const base = (item: Item, id: string, record: AdjustmentRecord | null) => ({
  id,
  item,
  itemFlags: item.flags,
  kind: (id === item.key ? 'primary' : 'correcting') as 'primary' | 'correcting',
  linkedTo: record?.linkedTo ?? null,
  corrects: null,
  correctedBy: [] as Adjustment['correctedBy'],
  review: null,
  log: record?.log ?? [],
});

function liveRow(session: Session, item: Item, id: string, record: AdjustmentRecord | null, total: number, count: number): Adjustment {
  const primary = id === item.key;
  const w = primary ? wastageFor(session, item) : null;
  const wastage = w?.wastage ?? 0;
  const unexplained = total + wastage;
  const direction: Direction = total > 0 ? 'ADD' : 'REMOVE';
  const supplierDocument = record?.supplierDocument ?? '';
  const needsSupplierDocument = direction === 'ADD' && supplierDocument === '';

  // An Approval whose Count no longer matches (left by an older version that did not cancel it) is treated as cancelled.
  const snapshot = record ? approvedSnapshot(record) : undefined;
  const stale = record?.status === 'Approved' && snapshot !== undefined && snapshot.count !== count;
  const storedStatus: AdjustmentStatus = stale ? 'Pending' : (record?.status ?? 'Pending');
  const last = record?.log.at(-1);
  const cancelled = last?.auto === true && last.to === 'Pending' ? { from: last.countFrom ?? null, to: last.countTo ?? null } : null;

  return {
    ...base(item, id, record),
    direction,
    quantity: Math.abs(total),
    total,
    count,
    expected: item.expected!,
    wastage,
    unexplained,
    wastageFlags: w?.flags ?? [],
    value: valueAtCost(total, item.cost),
    unexplainedValue: valueAtCost(unexplained, item.cost),
    status: storedStatus === 'Pending' && needsSupplierDocument ? 'Held' : storedStatus,
    storedStatus,
    supplierDocument,
    needsSupplierDocument,
    approval: record && storedStatus === 'Approved' ? approvalOf(record) : null,
    applied: null,
    countChange: stale ? { from: snapshot!.count, to: count } : cancelled,
    gone: null,
  };
}

/** From the last Approval's snapshot: what was agreed, whatever the Count is now. */
function fromSnapshot(item: Item, snapshot: ApprovalSnapshot | undefined) {
  const s = snapshot ?? { direction: 'REMOVE' as Direction, quantity: 0, total: 0, count: 0, expected: item.expected ?? 0, wastage: 0, unexplained: 0, supplierDocument: '' };
  return {
    direction: s.direction,
    quantity: s.quantity,
    total: s.total,
    count: s.count,
    expected: s.expected,
    wastage: s.wastage,
    unexplained: s.unexplained,
    wastageFlags: [] as WastageFlag[],
    value: valueAtCost(s.total, item.cost),
    unexplainedValue: valueAtCost(s.unexplained, item.cost),
    supplierDocument: s.supplierDocument,
    needsSupplierDocument: false,
  };
}

/** An Applied Adjustment, as it was applied. It is shown whatever the Count is now. */
function appliedRow(item: Item, id: string, record: AdjustmentRecord): Adjustment {
  const applied = lastLog(record, 'Applied');
  return {
    ...base(item, id, record),
    ...fromSnapshot(item, approvedSnapshot(record)),
    status: 'Applied',
    storedStatus: 'Applied',
    approval: approvalOf(record),
    applied: applied ? { by: applied.by, at: applied.at } : null,
    countChange: null,
    gone: null,
  };
}

/** History of an Approval whose Adjustment is not live now. Read-only. */
function ghostRow(item: Item, id: string, record: AdjustmentRecord, gone: 'count-removed' | 'count-changed'): Adjustment {
  return {
    ...base(item, id, record),
    ...fromSnapshot(item, approvedSnapshot(record)),
    status: record.status,
    storedStatus: record.status,
    approval: null,
    applied: null,
    countChange: null,
    gone,
  };
}

// ---- moves ----

export type Refusal =
  | 'no-adjustment'
  | 'name-required'
  | 'not-allowed'
  | 'note-required'
  | 'supplier-document-required'
  | 'applied-check-required'
  | 'document-not-needed'
  | 'no-review'
  | 'count-removed'
  | 'nothing-to-correct';

export type AdjustmentResult = { ok: true; session: Session } | { ok: false; reason: Refusal; message: string };

const refuse = (reason: Refusal, message: string): AdjustmentResult => ({ ok: false, reason, message });
const NO_ADJUSTMENT = 'This Item has no Adjustment: it must be Done with a Variance.';
const HISTORY_ONLY = 'This is history only: the count was removed or changed, so nothing can be done with it.';
const NAME_MESSAGE = 'Type your name.';

/** The only moves (ADR 0007). Applied is final: a mistake is fixed by a new, correcting Adjustment. */
const ALLOWED: Record<AdjustmentStatus, AdjustmentStatus[]> = {
  Pending: ['Approved', 'Rejected', 'Held'],
  Held: ['Pending', 'Approved', 'Rejected'],
  Rejected: ['Pending'],
  Approved: ['Applied', 'Pending'],
  Applied: [],
};

/** Reopening a Rejected Adjustment, or revoking an Approval, must say why. */
const needsNote = (from: AdjustmentStatus, to: AdjustmentStatus) => to === 'Pending' && (from === 'Rejected' || from === 'Approved');

export type TransitionInput = {
  to: AdjustmentStatus;
  /** The typed name of the person making the move. */
  by: string;
  note?: string;
  /** The device clock, ISO. */
  at: string;
  /** For Applied: "I checked the current Zobaze balance and intervening movements". */
  appliedCheck?: boolean;
  /** Which of the Item's Adjustments; the first one if left out. */
  id?: string;
};

/** Moves an Adjustment to a new status, or refuses and says why. A refusal changes nothing. */
export function transition(session: Session, item: Item, input: TransitionInput): AdjustmentResult {
  const adjustment = adjustmentFor(session, item, input.id);
  if (!adjustment) return refuse('no-adjustment', NO_ADJUSTMENT);
  if (adjustment.gone) return refuse('no-adjustment', HISTORY_ONLY);
  const by = input.by.trim();
  if (by === '') return refuse('name-required', NAME_MESSAGE);

  const { storedStatus: from } = adjustment;
  const { to } = input;
  if (!ALLOWED[from].includes(to)) return refuse('not-allowed', notAllowedMessage(from, to));

  const note = (input.note ?? '').trim();
  if (needsNote(from, to) && note === '') {
    return refuse('note-required', from === 'Approved' ? 'Say why the Approval is being revoked.' : 'Say why it is being reopened.');
  }
  if (to === 'Approved' && adjustment.needsSupplierDocument) {
    return refuse('supplier-document-required', 'An ADD needs a Supplier Document (invoice or delivery note number) before it can be Approved.');
  }
  if (to === 'Applied' && !input.appliedCheck) {
    return refuse('applied-check-required', 'Tick the box to confirm you checked the current Zobaze balance and intervening movements.');
  }

  const entry: AdjustmentLogEntry = {
    at: input.at,
    by,
    action: to,
    note,
    from,
    to,
    ...(to === 'Approved' ? { snapshot: snapshotOf(adjustment) } : {}),
    ...(to === 'Applied' ? { appliedCheck: true as const } : {}),
  };
  return append(session, item, adjustment.id, (record) => ({ ...record, status: to }), entry);
}

function notAllowedMessage(from: AdjustmentStatus, to: AdjustmentStatus): string {
  if (from === 'Applied') return 'An Applied Adjustment is final. A mistake needs a new, correcting Adjustment.';
  if (to === 'Applied') return 'Approve it first: only an Approved Adjustment can be marked Applied.';
  return `A ${from} Adjustment cannot become ${to}.`;
}

/** An ADD needs an invoice or delivery note number. Adding it lets the Adjustment leave Held. */
export function setSupplierDocument(session: Session, item: Item, document: string, by: string, at: string, id?: string): AdjustmentResult {
  const adjustment = adjustmentFor(session, item, id);
  if (!adjustment) return refuse('no-adjustment', NO_ADJUSTMENT);
  if (adjustment.gone) return refuse('no-adjustment', HISTORY_ONLY);
  if (by.trim() === '') return refuse('name-required', NAME_MESSAGE);
  if (adjustment.direction !== 'ADD') return refuse('document-not-needed', 'Only an ADD needs a Supplier Document.');
  const doc = document.trim();
  if (doc === '') return refuse('supplier-document-required', 'Type the invoice or delivery note number.');
  if (adjustment.storedStatus !== 'Pending' && adjustment.storedStatus !== 'Held') {
    return refuse('not-allowed', 'The Supplier Document cannot change now. Revoke or reopen the Adjustment first.');
  }
  return append(session, item, adjustment.id, (record) => ({ ...record, supplierDocument: doc }), { at, by: by.trim(), action: 'Supplier Document', note: doc });
}

export type ReviewInput = { by: string; note: string; at: string };

/** The Applied Adjustment of this Item that is waiting for a review, with what it needs. */
function flagged(session: Session, item: Item): Adjustment | null {
  return adjustmentsOf(session, item).find((a) => a.review !== null) ?? null;
}

/** "Acknowledge, no action needed": management has seen the change. The Applied record is not changed. */
export function acknowledge(session: Session, item: Item, input: ReviewInput): AdjustmentResult {
  const row = flagged(session, item);
  if (!row) return refuse('no-review', 'Nothing to review: this Item has no Applied Adjustment waiting for a review.');
  const check = reviewInputProblem(input);
  if (check) return check;
  const entry: AdjustmentLogEntry = { at: input.at, by: input.by.trim(), action: 'Acknowledged', note: input.note.trim(), reviewedCount: row.review!.currentCount };
  return append(session, item, row.id, (record) => record, entry);
}

/**
 * "Raise a correcting Adjustment": a NEW Adjustment linked to the Applied one, for the new Total
 * Variance minus what has been applied so far. It goes through the same statuses as any other.
 */
export function raiseCorrection(session: Session, item: Item, input: ReviewInput): AdjustmentResult {
  const row = flagged(session, item);
  if (!row) return refuse('no-review', 'Nothing to review: this Item has no Applied Adjustment waiting for a review.');
  const check = reviewInputProblem(input);
  if (check) return check;
  const review = row.review!;
  if (review.currentCount === null) return refuse('count-removed', 'The count was removed, so there is nothing to correct yet. Acknowledge it, or count the Item again.');
  if (!review.canCorrect) return refuse('nothing-to-correct', 'What was applied already matches the Count, so there is nothing to correct. Acknowledge it instead.');

  let n = 2;
  while (`${item.key}~${n}` in session.adjustments) n++;
  const newId = `${item.key}~${n}`;
  const by = input.by.trim();
  const note = input.note.trim();
  const action = 'Correcting Adjustment raised';
  const correcting: AdjustmentRecord = {
    itemKey: item.key,
    status: 'Pending',
    supplierDocument: '',
    linkedTo: row.id,
    log: [{ at: input.at, by, action, note }],
  };
  const original = session.adjustments[row.id]!;
  return {
    ok: true,
    session: {
      ...session,
      adjustments: {
        ...session.adjustments,
        [row.id]: { ...original, log: [...original.log, { at: input.at, by, action, note, reviewedCount: review.currentCount, linkedId: newId }] },
        [newId]: correcting,
      },
      adjustmentChanges: session.adjustmentChanges + 1,
    },
  };
}

function reviewInputProblem(input: ReviewInput): AdjustmentResult | null {
  if (input.by.trim() === '') return refuse('name-required', NAME_MESSAGE);
  if (input.note.trim() === '') return refuse('note-required', 'Type a note: what was checked, and what was decided.');
  return null;
}

function snapshotOf(a: Adjustment): ApprovalSnapshot {
  return {
    direction: a.direction,
    quantity: a.quantity,
    total: a.total,
    count: a.count,
    expected: a.expected,
    wastage: a.wastage,
    unexplained: a.unexplained,
    supplierDocument: a.supplierDocument,
  };
}

/** Writes the record and its new log entry. Bumps the Adjustment marker, never `changes` or `lastChangeAt`. */
function append(
  session: Session,
  item: Item,
  id: string,
  update: (record: AdjustmentRecord) => AdjustmentRecord,
  entry: AdjustmentLogEntry,
): AdjustmentResult {
  const current: AdjustmentRecord = session.adjustments[id] ?? {
    itemKey: item.key,
    status: 'Pending',
    supplierDocument: '',
    linkedTo: null,
    log: [],
  };
  const next = update(current);
  return {
    ok: true,
    session: {
      ...session,
      adjustments: { ...session.adjustments, [id]: { ...next, log: [...current.log, entry] } },
      adjustmentChanges: session.adjustmentChanges + 1,
    },
  };
}
