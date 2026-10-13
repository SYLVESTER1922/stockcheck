import { deriveAdjustments } from './adjustments';
import { canReplace, type Session } from './session';

/**
 * The reload guard for Adjustments (T26, ADR 0007), beside the guard for unreported Counts. A new
 * Export or a restore replaces the Session, so it must not silently throw away Adjustments that
 * nobody has written down anywhere else.
 *
 * Only what people RECORDED counts. An Adjustment nobody has acted on is derived from the Counts, and
 * the Session Report already holds those numbers, so it never triggers the guard: the pilot flow is unchanged.
 */
export type AdjustmentsGuard =
  | { level: 'none' }
  | {
      /** `block`: an Approved Adjustment is not yet Applied. `warn`: only Pending or on-hold records are at stake. */
      level: 'block' | 'warn';
      approved: number;
      pending: number;
      held: number;
    };

/** No Adjustment change since the last Adjustment Report was downloaded. Never the Session Report's marker. */
export const isAdjustmentsReported = (session: Session) => session.adjustmentsReportedChanges === session.adjustmentChanges;
export const markAdjustmentsReported = (session: Session): Session => ({ ...session, adjustmentsReportedChanges: session.adjustmentChanges });

const NONE: AdjustmentsGuard = { level: 'none' };

export function adjustmentsGuard(session: Session): AdjustmentsGuard {
  if (Object.keys(session.adjustments).length === 0 || isAdjustmentsReported(session)) return NONE;
  let approved = 0;
  let pending = 0;
  let held = 0;
  for (const a of deriveAdjustments(session).list) {
    if (a.log.length === 0) continue; // nobody recorded anything: derived, not a decision
    if (a.storedStatus === 'Approved') approved++;
    else if (a.storedStatus === 'Pending') pending++;
    else if (a.storedStatus === 'Held') held++;
    // Applied and Rejected are decided: nothing is lost that a person still needs to act on.
  }
  if (approved + pending + held === 0) return NONE;
  return { level: approved > 0 ? 'block' : 'warn', approved, pending, held };
}

/** A new Export or a restore needs the guard: unreported Counts, or Adjustments that are not yet reported. */
export const needsGuard = (session: Session) => !canReplace(session) || adjustmentsGuard(session).level !== 'none';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What would be lost, in plain words. Empty when nothing is. */
export function adjustmentsLine(guard: AdjustmentsGuard): string {
  if (guard.level === 'none') return '';
  const parts: string[] = [];
  if (guard.approved > 0) parts.push(`${plural(guard.approved, 'Approved Adjustment that is', 'Approved Adjustments that are')} not yet Applied`);
  if (guard.pending > 0) {
    parts.push(
      parts.length === 0
        ? `${plural(guard.pending, 'Adjustment', 'Adjustments')} with notes or decisions recorded, still Pending`
        : `${guard.pending} still Pending with notes or decisions recorded`,
    );
  }
  if (guard.held > 0) parts.push(parts.length === 0 ? `${plural(guard.held, 'Adjustment', 'Adjustments')} on hold` : `${guard.held} on hold`);
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}
