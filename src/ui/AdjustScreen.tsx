import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { actionsFor, historyLine, sameName, type Action } from '../domain/adjustActions';
import { adjustView, FILTERS, filterAdjustments, ITEM_FLAG_TEXT, leftOutLine, matchingLine, statusCounts, type StatusFilter } from '../domain/adjustView';
import { acknowledge, raiseCorrection, setSupplierDocument, transition, type Adjustment } from '../domain/adjustments';
import { formatLocalTime, formatQuantity, formatUsd, signedQuantity, signedUsd } from '../domain/format';
import { setCounter, type AdjustmentStatus, type Session } from '../domain/session';
import { WASTAGE_FLAG_TEXT } from '../domain/wastage';
import { adjustmentReportFileName, buildAdjustmentReport } from '../domain/adjustmentReport';
import { isAdjustmentsReported } from '../domain/replaceGuard';
import { download } from './download';
import { loadApprovers, loadNames, rememberApprover, rememberNames } from './storage';

/** Rows drawn at a time: a 600-Item stocktake stays quick on a cheap phone. Filter and search reach the rest. */
const PAGE = 50;


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
const BUTTON = 'min-h-11 min-w-11 rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800';

/** The Adjust tab (T23, T24, ADR 0007): what to correct in Zobaze by hand. StockCheck never changes Zobaze. */
type ScreenProps = {
  session: Session;
  onChange: (session: Session) => void;
  /** An Adjustment Report was downloaded: the Adjustments are reported up to this point (T26, T27). */
  onReported: () => void;
  onCounter: (name: string) => void;
  /** Open the Adjustment Report card at once (the guard sent the Counter here to download it). */
  openReport?: boolean;
};

export function AdjustScreen({ session, onChange, onReported, onCounter, openReport = false }: ScreenProps) {
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
          ? setSupplierDocument(latest.current, a.item, input.document, input.by, at, a.id)
          : action.kind === 'acknowledge'
            ? acknowledge(latest.current, a.item, { by: input.by, note: input.note, at })
            : action.kind === 'correct'
              ? raiseCorrection(latest.current, a.item, { by: input.by, note: input.note, at })
              : transition(latest.current, a.item, { to: action.to!, by: input.by, note: input.note, at, appliedCheck: input.appliedCheck, id: a.id });
      if (!result.ok) return result.message;
      setApprovers(rememberApprover(input.by.trim()));
      const named = latest.current.counter === '' && input.counter.trim() !== '' ? setCounter(result.session, input.counter) : result.session;
      const done = action.kind === 'acknowledge' ? 'Acknowledged' : action.kind === 'correct' ? 'Correcting Adjustment raised' : `${action.label} saved`;
      setNotice(`${a.item.name}${a.item.variant ? ` ${a.item.variant}` : ''}: ${done}.`);
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

      <ReportCard session={session} empty={view.list.length === 0} open={openReport} onReported={onReported} onCounter={onCounter} />

      {view.needsReview > 0 && (
        <p data-testid="needs-review" className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {view.needsReview} Applied {view.needsReview === 1 ? 'Adjustment needs' : 'Adjustments need'} a review: the count changed after {view.needsReview === 1 ? 'it was' : 'they were'} applied.
        </p>
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

      {a.status === 'Applied' && <p className="mt-1 text-xs text-slate-600">Figures as they were when it was applied.</p>}
      {a.review && <ReviewFlag review={a.review} />}
      {a.countChange && !a.gone && (
        <p data-testid="count-changed" className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">
          {a.countChange.to === null
            ? 'The count was removed after it was approved, so the Approval was cancelled.'
            : `The Count changed${a.countChange.from === null ? '' : ` from ${formatQuantity(a.countChange.from)}`} to ${formatQuantity(a.countChange.to)} after it was approved, so the Approval was cancelled. It needs approving again.`}
        </p>
      )}
      {a.gone && (
        <p data-testid="gone" className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-2 text-sm text-slate-800">
          {a.gone === 'count-removed'
            ? 'Count removed. This is the history of an Approval; nothing can be done with it.'
            : 'The Count changed, so there is no Adjustment now. This is the history of an Approval.'}
        </p>
      )}
      {a.corrects && (
        <p data-testid="corrects" className="mt-2 text-sm text-slate-800">
          Corrects the Adjustment applied{a.corrects.by ? ` by ${a.corrects.by}` : ''}
          {a.corrects.at ? ` · ${formatLocalTime(a.corrects.at)}` : ''}: {a.corrects.direction} {a.corrects.direction === 'ADD' ? '+' : '−'}
          {formatQuantity(a.corrects.quantity)}.
        </p>
      )}
      {a.correctedBy.map((c) => (
        <p key={c.id} data-testid="corrected-by" className="mt-2 text-sm text-slate-800">
          A correcting Adjustment was raised: {c.direction} {c.direction === 'ADD' ? '+' : '−'}
          {formatQuantity(c.quantity)} ({c.status}).
        </p>
      ))}
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
      {action.kind === 'correct' && a.review?.correction != null && (
        <p data-testid="correction-preview" className="text-sm text-slate-700">
          This raises a new Adjustment for the difference: {a.review.correction > 0 ? 'ADD +' : 'REMOVE −'}
          {formatQuantity(Math.abs(a.review.correction))}. The Applied one is not changed.
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
      {action.kind !== 'document' && (
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
        <button type="submit" className="min-h-12 flex-1 rounded-xl bg-brand-blue px-2 py-2 text-base font-bold text-white active:bg-brand-deep">
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

function ReviewFlag({ review }: { review: NonNullable<Adjustment['review']> }) {
  return (
    <div data-testid="review-flag" className="mt-2 rounded-xl border border-amber-400 bg-amber-50 p-2 text-sm text-amber-900">
      <p className="font-semibold">{review.reason === 'count-removed' ? 'Count removed after Applied: review' : 'Count changed after Applied: review'}</p>
      <p>
        It was applied with a Count of {formatQuantity(review.appliedCount)}.{' '}
        {review.currentCount === null ? 'The Item has no Count now.' : `The Count is now ${formatQuantity(review.currentCount)}.`}
      </p>
    </div>
  );
}

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * "Generate Adjustment Report" (T27): a separate Excel file, with its own marker. It never marks the
 * Session Report as reported. Branch and Counter are needed for the file name, like the Session Report.
 */
function ReportCard({ session, empty, open, onReported, onCounter }: { session: Session; empty: boolean; open: boolean; onReported: () => void; onCounter: (name: string) => void }) {
  const names = useMemo(loadNames, []);
  const [branch, setBranch] = useState(names.branches[0] ?? '');
  const [counter, setCounter] = useState(session.counter || (names.counters[0] ?? ''));
  const recorded = Object.keys(session.adjustments).length > 0;
  const ready = branch.trim() !== '' && counter.trim() !== '' && !empty;
  const status = !recorded
    ? null
    : isAdjustmentsReported(session)
      ? { text: 'Downloaded: everything recorded so far is in the Adjustment Report.', tone: 'text-emerald-700' }
      : session.adjustmentsReportedChanges === null
        ? { text: 'Not downloaded yet.', tone: 'text-amber-800' }
        : { text: 'Changed since the last Adjustment Report: download it again.', tone: 'text-amber-800' };

  async function onGenerate() {
    const now = new Date();
    const report = buildAdjustmentReport(session, { branch: branch.trim(), counter: counter.trim(), generatedAt: now.toISOString() });
    const { writeAdjustmentReport } = await import('../domain/workbook');
    download(adjustmentReportFileName(branch.trim(), counter.trim(), now), writeAdjustmentReport(report), XLSX_TYPE);
    rememberNames(branch.trim(), counter.trim());
    onCounter(counter.trim());
    onReported();
  }

  return (
    <details data-testid="report-card" open={open || undefined} className="rounded-2xl bg-white shadow-sm">
      <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-2 px-4 py-2 text-base font-semibold">
        <span>Adjustment Report</span>
        {status && <span data-testid="report-status" className={`text-xs font-medium ${status.tone}`}>{status.text}</span>}
      </summary>
      <form
        className="space-y-3 px-4 pb-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void onGenerate();
        }}
      >
        <p className="text-sm text-slate-700">
          A separate Excel file of every Adjustment, with who approved and applied each one and its history. It is a record, not security. It does not
          change the Session Report.
        </p>
        <label className="block text-sm font-medium">
          Branch
          <input list="adjust-branches" value={branch} autoComplete="off" onChange={(e) => setBranch(e.target.value)} className={FIELD} />
        </label>
        <datalist id="adjust-branches">
          {names.branches.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
        <label className="block text-sm font-medium">
          Counter
          <input list="adjust-counters" value={counter} autoComplete="off" onChange={(e) => setCounter(e.target.value)} className={FIELD} />
        </label>
        <datalist id="adjust-counters">
          {names.counters.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={!ready}
          className="min-h-12 w-full rounded-2xl bg-brand-blue px-4 py-2 text-base font-bold text-white disabled:bg-slate-300 disabled:text-slate-600"
        >
          Generate Adjustment Report
        </button>
        {empty && <p className="text-sm text-slate-600">There are no Adjustments to report yet.</p>}
      </form>
    </details>
  );
}
