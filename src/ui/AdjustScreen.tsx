import { memo, useMemo, useState } from 'react';
import { adjustView, FILTERS, filterAdjustments, leftOutLine, matchingLine, statusCounts, type StatusFilter } from '../domain/adjustView';
import type { Adjustment } from '../domain/adjustments';
import { formatLocalTime, formatQuantity, formatUsd, signedQuantity, signedUsd } from '../domain/format';
import type { AdjustmentStatus, Session } from '../domain/session';
import { WASTAGE_FLAG_TEXT } from '../domain/wastage';

/** Rows drawn at a time: a 600-Item stocktake stays quick on a cheap phone. Filter and search reach the rest. */
const PAGE = 50;

const ITEM_FLAG_TEXT: Record<string, string> = {
  'negative-system-stock': 'Negative System Stock',
  'blank-expected': 'Expected was blank, treated as 0',
  'no-cost': 'No cost price',
};

const STATUS_STYLE: Record<AdjustmentStatus, string> = {
  Pending: 'bg-slate-100 text-slate-800',
  Approved: 'bg-blue-100 text-blue-900',
  Applied: 'bg-emerald-100 text-emerald-900',
  Rejected: 'bg-rose-100 text-rose-900',
  Held: 'bg-amber-100 text-amber-900',
};

/** The Adjust tab (T23, ADR 0007): what to correct in Zobaze by hand. StockCheck never changes Zobaze. */
export function AdjustScreen({ session }: { session: Session }) {
  const view = useMemo(() => adjustView(session), [session]);
  const counts = useMemo(() => statusCounts(view.list), [view]);
  const [filter, setFilter] = useState<StatusFilter>('All');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const rows = useMemo(() => filterAdjustments(view.list, filter, query), [view, filter, query]);
  const leftOut = leftOutLine(view.leftOut);
  const matching = matchingLine(view.matching);

  return (
    <section className="mt-4 space-y-4">
      <div data-testid="export-date" className="rounded-2xl bg-gradient-to-br from-brand-deep to-brand-blue p-4 text-white shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-100 uppercase">Quantities are measured against this Export</p>
        <p className="mt-1 text-sm font-semibold text-white">Export loaded</p>
        <p className="text-2xl font-bold whitespace-nowrap tabular-nums">{formatLocalTime(session.loadedAt)}</p>
        <p className="mt-1 text-sm break-words text-blue-100">{session.exportFileName}</p>
        <p className="mt-2 text-sm text-blue-100">
          Check the current Zobaze balance before you change anything. StockCheck never changes Zobaze.
        </p>
      </div>

      {(leftOut || matching) && (
        <div className="space-y-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          {leftOut && <p data-testid="left-out">{leftOut}</p>}
          {matching && <p data-testid="matching">{matching}</p>}
        </div>
      )}

      {view.list.length === 0 ? (
        <p data-testid="no-adjustments" className="rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">
          No Adjustments yet. One appears for each counted Item whose Count is different from Expected.
        </p>
      ) : (
        <>
          <div className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
            <div role="group" aria-label="Status" className="flex flex-wrap gap-2">
              {FILTERS.map((option) => (
                <button
                  key={option}
                  aria-pressed={filter === option}
                  onClick={() => {
                    setFilter(option);
                    setLimit(PAGE);
                  }}
                  className={`h-11 min-w-11 rounded-xl border-2 px-3 text-sm font-semibold ${
                    filter === option ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-300 bg-white text-slate-700'
                  }`}
                >
                  {option} <span className="tabular-nums">{counts[option]}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Find an adjustment"
              placeholder="Name, variant or SKU"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              className="h-12 w-full rounded-xl border-2 border-slate-300 px-3 text-base outline-none focus:border-brand-blue"
            />
            <p data-testid="shown" className="text-sm text-slate-600">
              Showing {Math.min(limit, rows.length)} of {rows.length}
              {rows.length !== view.list.length && ` (${view.list.length} in all)`}
            </p>
          </div>

          {rows.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">No Adjustments match.</p>}
          <ul className="space-y-3">
            {rows.slice(0, limit).map((a) => (
              <li key={a.id}>
                <AdjustmentRow a={a} />
              </li>
            ))}
          </ul>
          {rows.length > limit && (
            <button
              onClick={() => setLimit(limit + PAGE)}
              className="h-12 w-full rounded-2xl border-2 border-slate-300 bg-white text-base font-semibold text-slate-700"
            >
              Show {Math.min(PAGE, rows.length - limit)} more ({rows.length - limit} left)
            </button>
          )}
        </>
      )}
    </section>
  );
}

const AdjustmentRow = memo(function AdjustmentRow({ a }: { a: Adjustment }) {
  const add = a.direction === 'ADD';
  const flags = [...a.itemFlags.flatMap((f) => (ITEM_FLAG_TEXT[f] ? [ITEM_FLAG_TEXT[f]] : [])), ...a.wastageFlags.map((f) => WASTAGE_FLAG_TEXT[f])];
  return (
    <article data-testid="adjustment-row" className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold break-words">
            {a.item.name} <span className="font-normal text-slate-600">{a.item.variant}</span>
            {a.item.duplicate !== null && (
              <span className="ml-1 text-xs font-normal text-amber-800">
                #{a.item.duplicate} · {formatUsd(a.item.cost)}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-600">{a.item.sku ? `SKU ${a.item.sku}` : 'No SKU'}</p>
        </div>
        <span data-testid="status" className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[a.status]}`}>
          {a.status}
        </span>
      </div>

      <p
        data-testid="action"
        className={`mt-2 rounded-xl px-3 py-2 text-lg font-bold tabular-nums ${add ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}
      >
        {add ? 'ADD' : 'REMOVE'} {add ? '+' : '−'}
        {formatQuantity(a.quantity)}
        <span className="ml-2 text-sm font-semibold whitespace-nowrap">{signedUsd(a.value)}</span>
      </p>

      <dl className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
        <Cell label="Expected" value={formatQuantity(a.expected)} />
        <Cell label="Count" value={formatQuantity(a.count)} />
        <Cell label="Total Variance" value={signedQuantity(a.total)} />
        <Cell label="Wastage" value={a.wastage > 0 ? formatQuantity(a.wastage) : '—'} />
        <Cell label="Unexplained Variance" value={signedQuantity(a.unexplained)} bold />
      </dl>

      {a.needsSupplierDocument && (
        <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          Held: an ADD needs a Supplier Document (invoice or delivery note number) before it can be Approved.
        </p>
      )}
      {a.supplierDocument && <p className="mt-2 text-sm text-slate-700">Supplier Document: {a.supplierDocument}</p>}
      {flags.map((text) => (
        <p key={text} className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          {text}
        </p>
      ))}
    </article>
  );
});

function Cell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={bold ? 'font-bold' : ''}>{value}</dd>
    </div>
  );
}
