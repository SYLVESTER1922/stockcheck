import type { Adjustment } from './adjustments';
import { formatLocalTime } from './format';
import type { AdjustmentLogEntry, AdjustmentStatus } from './session';

/**
 * What a row on the Adjust tab offers (T24, ADR 0007). Buttons come from the STORED status, never
 * from the status shown: an ADD held only for want of a Supplier Document is stored as Pending, so
 * it offers the Pending moves and never "Back to Pending". The rules themselves are T22's
 * `transition`; a test checks that a move is offered if and only if it would be accepted.
 */
export type Action = {
  label: string;
  kind: 'move' | 'document';
  /** The status moved to, for a move. */
  to?: AdjustmentStatus;
  /** A note is not asked for, may be given, or must be given. */
  note: 'optional' | 'required';
  /** The "I checked the current Zobaze balance and intervening movements" tick. */
  appliedCheck: boolean;
};

const move = (label: string, to: AdjustmentStatus, note: Action['note'] = 'optional', appliedCheck = false): Action => ({
  label,
  kind: 'move',
  to,
  note,
  appliedCheck,
});

export function actionsFor(a: Adjustment): Action[] {
  const approve = a.needsSupplierDocument ? [] : [move('Approve', 'Approved')];
  const document: Action[] =
    a.direction === 'ADD'
      ? [{ label: a.supplierDocument ? 'Change Supplier Document' : 'Add Supplier Document', kind: 'document', note: 'optional', appliedCheck: false }]
      : [];

  switch (a.storedStatus) {
    case 'Pending':
      return [...document, ...approve, move('Reject', 'Rejected'), move('Put on hold', 'Held')];
    case 'Held':
      return [...document, ...approve, move('Back to Pending', 'Pending'), move('Reject', 'Rejected')];
    case 'Rejected':
      return [move('Reopen', 'Pending', 'required')];
    case 'Approved':
      return [move('Mark Applied', 'Applied', 'optional', true), move('Revoke approval', 'Pending', 'required')];
    case 'Applied':
      return [];
  }
}

const VERB = (entry: AdjustmentLogEntry): string => {
  switch (entry.to) {
    case 'Approved':
      return 'Approved by';
    case 'Applied':
      return 'Applied by';
    case 'Rejected':
      return 'Rejected by';
    case 'Held':
      return 'Put on hold by';
    case 'Pending':
      return entry.from === 'Approved' ? 'Approval revoked by' : entry.from === 'Rejected' ? 'Reopened by' : 'Moved back to Pending by';
    default:
      return entry.action === 'Supplier Document' ? `Supplier Document ${entry.note} recorded by` : `${entry.action} by`;
  }
};

/** One line of an Adjustment's history: who, what, when, and the note. Plain facts only. */
export function historyLine(entry: AdjustmentLogEntry): string {
  const note = entry.action === 'Supplier Document' ? '' : entry.note;
  return `${VERB(entry)} ${entry.by} · ${formatLocalTime(entry.at)}${note ? ` · ${note}` : ''}`;
}

const normal = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The approver has the same name as the Counter. Allowed: it is shown as a warning, never a block. */
export function sameName(a: string, b: string | undefined): boolean {
  return b !== undefined && normal(a) !== '' && normal(a) === normal(b);
}
