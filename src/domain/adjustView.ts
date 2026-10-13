import { deriveAdjustments, type Adjustment, type AdjustmentsView } from './adjustments';
import { normalise } from './search';
import type { AdjustmentStatus, Session } from './session';

/** The Adjust tab's list (T23): T22's Adjustments, sorted, counted, filtered and searched. */
export type StatusFilter = 'All' | AdjustmentStatus;
export const FILTERS: StatusFilter[] = ['All', 'Pending', 'Approved', 'Applied', 'Rejected', 'Held'];

/** Applied Adjustments waiting for a review first, so a change after Applied is never buried; then largest value (at cost); then name. */
const byValueThenName = (a: Adjustment, b: Adjustment) =>
  Number(b.review !== null) - Number(a.review !== null) ||
  Math.abs(b.value) - Math.abs(a.value) ||
  a.item.name.localeCompare(b.item.name) ||
  a.item.variant.localeCompare(b.item.variant) ||
  a.id.localeCompare(b.id);

export function adjustView(session: Session): AdjustmentsView {
  const view = deriveAdjustments(session);
  return { ...view, list: view.list.slice().sort(byValueThenName) };
}

/** By the status shown on the row, so an ADD held for lack of a Supplier Document counts as Held. */
export function statusCounts(list: Adjustment[]): Record<StatusFilter, number> {
  const counts: Record<StatusFilter, number> = { All: list.length, Pending: 0, Approved: 0, Applied: 0, Rejected: 0, Held: 0 };
  for (const a of list) counts[a.status]++;
  return counts;
}

/** Search by name, Variant or SKU. Every word must match; an empty search matches everything. */
export function filterAdjustments(list: Adjustment[], filter: StatusFilter, query: string): Adjustment[] {
  const words = normalise(query).split(' ').filter(Boolean);
  return list.filter((a) => {
    if (filter !== 'All' && a.status !== filter) return false;
    if (words.length === 0) return true;
    const haystack = normalise(`${a.item.name} ${a.item.variant} ${a.item.sku}`);
    return words.every((word) => haystack.includes(word));
  });
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Why some Items are not in the list yet. Null when every Item is. */
export function leftOutLine(leftOut: AdjustmentsView['leftOut']): string | null {
  const total = leftOut.uncounted + leftOut.inProgress + leftOut.expectedUnreadable;
  if (total === 0) return null;
  const reasons = [
    leftOut.uncounted > 0 && `${leftOut.uncounted} not counted`,
    leftOut.inProgress > 0 && `${leftOut.inProgress} in progress`,
    leftOut.expectedUnreadable > 0 && `${leftOut.expectedUnreadable} with an unreadable Expected`,
  ].filter(Boolean);
  return `${total} ${plural(total, 'Item is', 'Items are')} not here yet: ${reasons.join(', ')}.`;
}

/** Done Items with no Variance need no Adjustment. */
export function matchingLine(matching: number): string | null {
  if (matching === 0) return null;
  return `${matching} counted ${plural(matching, 'Item matches', 'Items match')} Expected, so ${plural(matching, 'needs', 'need')} no Adjustment.`;
}
