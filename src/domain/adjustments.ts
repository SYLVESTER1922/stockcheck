import type { Item, ItemFlag } from './export';
import { valueAtCost } from './money';
import {
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
 * Zobaze by hand. The list is DERIVED from the Tallies and Wastage every time: quantity, direction
 * and split are never stored. Only what people decided is stored, as an AdjustmentRecord with its
 * log: the status, the Supplier Document, and each Approval's snapshot (inside its log entry).
 * Netrisyl never updates Zobaze.
 */
export type Direction = 'ADD' | 'REMOVE';

export type Adjustment = {
  /** The Item Key. Correcting Adjustments (T25) will have their own ids. */
  id: string;
  item: Item;
  itemFlags: ItemFlag[];
  direction: Direction;
  /** The Total Variance as a positive quantity (thousandths). What staff type into Zobaze. */
  quantity: number;
  /** Count − Expected, signed. */
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
};

export type AdjustmentsView = {
  list: Adjustment[];
  /** Items that cannot have an Adjustment yet, and why. */
  leftOut: { uncounted: number; inProgress: number; expectedUnreadable: number };
  /** Done Items with a Total Variance of 0: nothing to adjust. */
  matching: number;
};

export function deriveAdjustments(session: Session): AdjustmentsView {
  const view: AdjustmentsView = { list: [], leftOut: { uncounted: 0, inProgress: 0, expectedUnreadable: 0 }, matching: 0 };
  for (const item of session.items) {
    const line = lineFor(session, item);
    if (line.status === 'uncounted') view.leftOut.uncounted++;
    else if (line.status === 'in-progress') view.leftOut.inProgress++;
    else if (line.variance === null) view.leftOut.expectedUnreadable++;
    else if (line.variance === 0) view.matching++;
    else view.list.push(derive(session, item, line.count, line.variance));
  }
  return view;
}

/** The Item's Adjustment, or null if it is not Done, has no Variance, or its Expected is unreadable. */
export function adjustmentFor(session: Session, item: Item): Adjustment | null {
  const line = lineFor(session, item);
  if (line.status !== 'finished' || line.variance === null || line.variance === 0) return null;
  return derive(session, item, line.count, line.variance);
}

function derive(session: Session, item: Item, count: number, total: number): Adjustment {
  const w = wastageFor(session, item);
  const wastage = w?.wastage ?? 0;
  const unexplained = total + wastage;
  const record = session.adjustments[item.key] ?? null;
  const storedStatus = record?.status ?? 'Pending';
  const supplierDocument = record?.supplierDocument ?? '';
  const direction: Direction = total > 0 ? 'ADD' : 'REMOVE';
  const needsSupplierDocument = direction === 'ADD' && supplierDocument === '';
  const log = record?.log ?? [];
  const last = (to: AdjustmentStatus) => [...log].reverse().find((entry) => entry.to === to);
  const approved = storedStatus === 'Approved' || storedStatus === 'Applied' ? last('Approved') : undefined;
  const applied = storedStatus === 'Applied' ? last('Applied') : undefined;

  return {
    id: item.key,
    item,
    itemFlags: item.flags,
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
    approval: approved?.snapshot ? { by: approved.by, at: approved.at, snapshot: approved.snapshot } : null,
    applied: applied ? { by: applied.by, at: applied.at } : null,
    log,
  };
}

export type Refusal =
  | 'no-adjustment'
  | 'name-required'
  | 'not-allowed'
  | 'note-required'
  | 'supplier-document-required'
  | 'applied-check-required'
  | 'document-not-needed';

export type AdjustmentResult = { ok: true; session: Session } | { ok: false; reason: Refusal; message: string };

const refuse = (reason: Refusal, message: string): AdjustmentResult => ({ ok: false, reason, message });

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
};

const NAME_MESSAGE = 'Type your name.';

/** Moves an Adjustment to a new status, or refuses and says why. A refusal changes nothing. */
export function transition(session: Session, item: Item, input: TransitionInput): AdjustmentResult {
  const adjustment = adjustmentFor(session, item);
  if (!adjustment) return refuse('no-adjustment', 'This Item has no Adjustment: it must be Done with a Variance.');
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
  return append(session, item, (record) => ({ ...record, status: to }), entry);
}

function notAllowedMessage(from: AdjustmentStatus, to: AdjustmentStatus): string {
  if (from === 'Applied') return 'An Applied Adjustment is final. A mistake needs a new, correcting Adjustment.';
  if (to === 'Applied') return 'Approve it first: only an Approved Adjustment can be marked Applied.';
  return `A ${from} Adjustment cannot become ${to}.`;
}

/** An ADD needs an invoice or delivery note number. Adding it lets the Adjustment leave Held. */
export function setSupplierDocument(session: Session, item: Item, document: string, by: string, at: string): AdjustmentResult {
  const adjustment = adjustmentFor(session, item);
  if (!adjustment) return refuse('no-adjustment', 'This Item has no Adjustment: it must be Done with a Variance.');
  if (by.trim() === '') return refuse('name-required', NAME_MESSAGE);
  if (adjustment.direction !== 'ADD') return refuse('document-not-needed', 'Only an ADD needs a Supplier Document.');
  const doc = document.trim();
  if (doc === '') return refuse('supplier-document-required', 'Type the invoice or delivery note number.');
  if (adjustment.storedStatus !== 'Pending' && adjustment.storedStatus !== 'Held') {
    return refuse('not-allowed', 'The Supplier Document cannot change now. Revoke or reopen the Adjustment first.');
  }
  return append(session, item, (record) => ({ ...record, supplierDocument: doc }), { at, by: by.trim(), action: 'Supplier Document', note: doc });
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
  update: (record: AdjustmentRecord) => AdjustmentRecord,
  entry: AdjustmentLogEntry,
): AdjustmentResult {
  const base: AdjustmentRecord = session.adjustments[item.key] ?? {
    itemKey: item.key,
    status: 'Pending',
    supplierDocument: '',
    linkedTo: null,
    log: [],
  };
  const next = update(base);
  return {
    ok: true,
    session: {
      ...session,
      adjustments: { ...session.adjustments, [item.key]: { ...next, log: [...base.log, entry] } },
      adjustmentChanges: session.adjustmentChanges + 1,
    },
  };
}
