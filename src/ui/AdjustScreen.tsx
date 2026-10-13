import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { actionsFor, historyLine, sameName, type Action } from '../domain/adjustActions';
import { adjustView, FILTERS, filterAdjustments, leftOutLine, matchingLine, statusCounts, type StatusFilter } from '../domain/adjustView';
import { setSupplierDocument, transition, type Adjustment } from '../domain/adjustments';
import { formatLocalTime, formatQuantity, formatUsd, signedQuantity, signedUsd } from '../domain/format';
import { setCounter, type AdjustmentStatus, type Session } from '../domain/session';
import { WASTAGE_FLAG_TEXT } from '../domain/wastage';
import { loadApprovers, loadNames, rememberApprover } from './storage';

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

type Input = { by: string; note: string; document: string; appliedCheck: boolean; counter: string };
/** Returns the refusal message, or null once the change is made. */
type Apply = (a: Adjustment, action: Action, input: Input) => string | null;

const FIELD = 'mt-1 h-12 w-full rounded-xl border-2 border-slate-300 bg-white px-3 text-base outline-none focus:border-brand-blue';
const BUTTON = 'h-11 min-w-11 rounded-xl border-2 border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800';

/** The Adjust tab (T23, T24, ADR 0007): what to correct in Zobaze by hand. StockCheck never changes Zobaze. */
export function AdjustScreen({ session, onChange }: { session: Session; onChange: (session: Session) => void }) {
  const view = useMemo(() => adjustView(session), [session]);
  const counts = useMemo(() => statusCounts(view.list), [view]);
  const [filter, setFilter] = useState<StatusFilter>('All');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [notice, setNotice] = useState<string | null>(null);
  const [approvers, setApprovers] = useState(loadApprovers);
  const counter = session.counter;
  const counters = useMemo(() => loadNames().counters, []);
  const rows = useMemo(() => filterAdjustments(view.list, filter, query), [view, filter, query]);
  const leftOut = leftOutLine(view.leftOut);
  const matching = matchingLine(view.matching);
  const exportDate = formatLocalTime(session.loadedAt);

  // The latest Session, so the callback below stays the same between renders and rows stay memoised.
  const latest = useRef(session);
  latest.current = session;

  const apply = useCallback<Apply>(
    (a, action, input) => {
      const at = new Date().toISOString();
      const result =
        action.kind === 'document'
          ? setSupplierDocument(latest.current, a.item, input.document, input.by, at)
          : transition(latest.current, a.item, { to: action.to!, by: input.by, note: input.note, at, appliedCheck: input.appliedCheck });
      if (!result.ok) return result.message;
      setApprovers(rememberApprover(input.by.trim()));
      const named = latest.current.counter === '' && input.counter.trim() !== '' ? setCounter(result.session, input.counter) : result.session;
      setNotice(`${a.item.name}${a.item.variant ? ` ${a.item.variant}` : ''}: ${action.label} saved.`);
      onChange(named);
      return null;
    },
    [onChange],
  );

  return (
    <section className="mt-4 space-y-4">
      <div data-testid="export-date" className="rounded-2xl bg-gradient-to-br from-brand-deep to-brand-blue p-4 text-white shadow-sm">
        <p className="text-xs font-semibold tracking-wide text-blue-100 uppercase">Quantities are measured against this Export</p>
        <p className="mt-1 text-sm font-semibold text-white">Export loaded</p>
        <p className="text-2xl font-bold whitespace-nowrap tabular-nums">{exportDate}</p>
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

      {notice && (
        <p role="status" data-testid="notice" className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          {notice}
        </p>
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

          <datalist id="approver-names">
            {approvers.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {rows.length === 0 && <p className="rounded-2xl bg-white p-4 text-sm text-slate-700 shadow-sm">No Adjustments match.</p>}
          <ul className="space-y-3">
            {rows.slice(0, limit).map((a) => (
              <li key={a.id}>
                <AdjustmentRow a={a} exportDate={exportDate} counter={counter} counters={counters} apply={apply} />
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

type RowProps = { a: Adjustment; exportDate: string; counter: string; counters: string[]; apply: Apply };

const AdjustmentRow = memo(function AdjustmentRow({ a, exportDate, counter, counters, apply }: RowProps) {
  const add = a.direction === 'ADD';
  const flags = [...a.itemFlags.flatMap((f) => (ITEM_FLAG_TEXT[f] ? [ITEM_FLAG_TEXT[f]] : [])), ...a.wastageFlags.map((f) => WASTAGE_FLAG_TEXT[f])];
  const [open, setOpen] = useState<Action | null>(null);
  const [history, setHistory] = useState(false);
  const actions = actionsFor(a);

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

      {a.approval && (
        <p data-testid="approved-by" className="mt-2 text-sm text-slate-800">
          Approved by {a.approval.by} · {formatLocalTime(a.approval.at)}
        </p>
      )}
      {a.applied && (
        <p data-testid="applied-by" className="text-sm text-slate-800">
          Applied by {a.applied.by} · {formatLocalTime(a.applied.at)}
        </p>
      )}
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

      {open ? (
        <ActionForm
          a={a}
          action={open}
          exportDate={exportDate}
          counter={counter}
          counters={counters}
          apply={apply}
          onClose={() => setOpen(null)}
        />
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {actions.map((action) => (
            <button key={action.label} onClick={() => setOpen(action)} className={BUTTON}>
              {action.label}
            </button>
          ))}
          {a.log.length > 0 && (
            <button aria-expanded={history} onClick={() => setHistory(!history)} className={`${BUTTON} text-slate-600`}>
              History
            </button>
          )}
        </div>
      )}

      {history && !open && (
        <ol data-testid="history" className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          {a.log.map((entry, i) => (
            <li key={i}>{historyLine(entry)}</li>
          ))}
        </ol>
      )}
    </article>
  );
});

function ActionForm({ a, action, exportDate, counter, counters, apply, onClose }: { a: Adjustment; action: Action; exportDate: string; counter: string; counters: string[]; apply: Apply; onClose: () => void }) {
  const [by, setBy] = useState('');
  const [counterTyped, setCounterTyped] = useState('');
  const [note, setNote] = useState('');
  const [supplierDoc, setSupplierDoc] = useState(a.supplierDocument);
  const [appliedCheck, setAppliedCheck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const opened = useMemo(() => formatLocalTime(new Date().toISOString()), []);
  const records = action.to === 'Approved' || action.to === 'Applied';
  const asksCounter = action.to === 'Approved' && counter === '';
  const knownCounter = counter || counterTyped;

  return (
    <form
      data-testid="action-form"
      noValidate
      className="mt-3 space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        const message = apply(a, action, { by, note, document: supplierDoc, appliedCheck, counter: counterTyped });
        if (message) setError(message);
        else onClose();
      }}
    >
      <p className="text-sm font-semibold">{action.label}</p>
      {records && (
        <p className="text-sm text-slate-700">
          This keeps the name you type and the time on this phone. It is a record, not security: anyone using this phone can type a name.
        </p>
      )}
      {action.kind === 'document' && (
        <label className="block text-sm font-medium">
          Supplier Document (invoice or delivery note number)
          <input value={supplierDoc} autoComplete="off" onChange={(e) => setSupplierDoc(e.target.value)} className={FIELD} />
        </label>
      )}
      <label className="block text-sm font-medium">
        {action.to === 'Applied' ? 'Your name (who applied it)' : 'Your name'}
        <input aria-label="Your name" list="approver-names" value={by} autoComplete="off" onChange={(e) => setBy(e.target.value)} className={FIELD} />
      </label>
      {asksCounter && (
        <label className="block text-sm font-medium">
          Counter of this count (asked once)
          <input aria-label="Counter of this count" list="counter-names" value={counterTyped} autoComplete="off" onChange={(e) => setCounterTyped(e.target.value)} className={FIELD} />
          <datalist id="counter-names">
            {counters.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
        </label>
      )}
      {action.to === 'Approved' && sameName(by, knownCounter) && (
        <p role="status" data-testid="same-name" className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          This is the same name as the Counter of this count. That is allowed, and it is recorded as typed.
        </p>
      )}
      {action.kind === 'move' && (
        <label className="block text-sm font-medium">
          {action.note === 'required' ? 'Note (needed)' : 'Note (optional)'}
          <input aria-label="Note" value={note} autoComplete="off" onChange={(e) => setNote(e.target.value)} className={FIELD} />
        </label>
      )}
      {action.appliedCheck && (
        <>
          <p className="text-sm text-slate-700">Quantities are measured against the Export loaded {exportDate}.</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={appliedCheck}
              onChange={(e) => setAppliedCheck(e.target.checked)}
              className="h-11 w-11 shrink-0 accent-brand-blue"
            />
            I checked the current Zobaze balance and intervening movements.
          </label>
        </>
      )}
      <p className="text-xs text-slate-600">Time: {opened}, taken from this phone&rsquo;s clock when you confirm. It cannot be edited.</p>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} className="h-12 w-1/3 rounded-xl border-2 border-slate-300 bg-white text-sm font-semibold text-slate-700">
          Cancel
        </button>
        <button type="submit" className="h-12 flex-1 rounded-xl bg-brand-blue text-base font-bold text-white active:bg-brand-deep">
          {action.label}
        </button>
      </div>
    </form>
  );
}

function Cell({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className={bold ? 'font-bold' : ''}>{value}</dd>
    </div>
  );
}
