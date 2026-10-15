import type { Item } from './export';
import { searchItems } from './search';
import { lineFor, type Session } from './session';

/** The Count tab's list views and progress (T29). Read-only: nothing here changes a Session. */
export type CountFilter = 'to-count' | 'counted' | 'flagged';

/** Counted means Done, the same as the header's "% counted". */
export function countProgress(session: Session) {
  const total = session.items.length;
  const counted = session.items.filter((item) => session.finished[item.key]).length;
  return { counted, total, left: total - counted, percent: total === 0 ? 0 : Math.round((counted / total) * 100) };
}

/** Flagged: a Done Item whose Variance fired Look Again. */
const isFlagged = (session: Session, item: Item) => {
  const line = lineFor(session, item);
  return line.status === 'finished' && line.lookAgain !== null;
};

const inFilter = (session: Session, item: Item, filter: CountFilter) =>
  filter === 'to-count' ? !session.finished[item.key] : filter === 'counted' ? !!session.finished[item.key] : isFlagged(session, item);

export function tabCounts(session: Session): Record<CountFilter, number> {
  const counts: Record<CountFilter, number> = { 'to-count': 0, counted: 0, flagged: 0 };
  for (const item of session.items) {
    for (const filter of Object.keys(counts) as CountFilter[]) if (inFilter(session, item, filter)) counts[filter]++;
  }
  return counts;
}

/**
 * With a tab: its Items (Export order), narrowed by the search when there is one. With no tab: the
 * search alone, and nothing for an empty search.
 */
export function filterCountItems(session: Session, filter: CountFilter | null, query: string): Item[] {
  const pool = filter === null ? session.items : session.items.filter((item) => inFilter(session, item, filter));
  if (query.trim() === '') return filter === null ? [] : pool;
  return searchItems(pool, query);
}

export type RecentItem = { item: Item; count: number };

/** The last Done Items, newest first. Done order is the order of `finished`: removing and redoing moves an Item to the end. */
export function recentlyCounted(session: Session, limit = 5): RecentItem[] {
  const byKey = new Map(session.items.map((item) => [item.key, item]));
  const recent: RecentItem[] = [];
  for (const key of Object.keys(session.finished).reverse()) {
    const item = byKey.get(key);
    const line = item && lineFor(session, item);
    if (!item || line?.status !== 'finished') continue;
    recent.push({ item, count: line.count });
    if (recent.length === limit) break;
  }
  return recent;
}
