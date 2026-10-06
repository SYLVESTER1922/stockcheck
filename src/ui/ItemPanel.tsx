import { useState } from 'react';
import type { Item } from '../domain/export';
import { formatQuantity, formatUsd } from '../domain/format';
import { addTally, editTally, finishItem, lineFor, removeTally, type Session } from '../domain/session';
import { parseTally } from '../domain/tally';

const LOOK_AGAIN_TEXT = {
  shortage: 'Check every place this item could be stored.',
  surplus: 'Possible delivery not booked in Zobaze.',
} as const;

type Props = { item: Item; session: Session; onChange: (session: Session) => void; onClose: () => void };

/** Entering Tallies for one Item. Expected stays hidden until Done (ADR 0004). */
export function ItemPanel({ item, session, onChange, onClose }: Props) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const line = lineFor(session, item);
  const tallies = line.status === 'uncounted' ? [] : line.tallies;
  const parsed = parseTally(text);
  const echo = parsed.ok && formatQuantity(parsed.value) !== text.trim() ? `= ${formatQuantity(parsed.value)}` : null;
  const now = () => new Date().toISOString();

  /** Adds the typed Tally (if any). Returns the new Session, or null if the input was invalid. */
  function withTyped(allowEmpty: boolean): Session | null {
    if (text.trim() === '' && allowEmpty) return session;
    if (!parsed.ok) {
      setError(parsed.message);
      return null;
    }
    setError(null);
    setText('');
    return addTally(session, item, parsed.value, now());
  }

  function done() {
    const next = withTyped(tallies.length > 0);
    if (next) onChange(finishItem(next, item, now()));
  }

  function another() {
    const next = withTyped(false);
    if (next) onChange(next);
  }

  return (
    <section data-testid="item-panel" className="mt-3 rounded-2xl border-2 border-blue-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="text-lg font-semibold">
          {item.name} <span className="font-normal text-slate-500">{item.variant}</span>
          {item.duplicate !== null && (
            <span className="ml-1 text-xs text-amber-700">
              #{item.duplicate} · {formatUsd(item.cost)}
            </span>
          )}
        </p>
        <button onClick={onClose} aria-label="Close" className="-mt-2 -mr-2 h-11 w-11 shrink-0 text-xl text-slate-500">
          ✕
        </button>
      </div>

      {tallies.length > 0 && (
        <ul className="mt-2 flex flex-wrap items-center gap-2 text-base tabular-nums">
          {tallies.map((t, i) =>
            editing === i ? (
              <TallyEditor
                key={i}
                initial={formatQuantity(t)}
                onSave={(value) => {
                  onChange(editTally(session, item, i, value, now()));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <li key={i} className="flex items-center rounded-xl bg-slate-100">
                <button aria-label={`Edit ${formatQuantity(t)}`} onClick={() => setEditing(i)} className="h-11 min-w-11 px-3 font-semibold">
                  {formatQuantity(t)}
                </button>
                <button
                  aria-label={`Remove ${formatQuantity(t)}`}
                  onClick={() => onChange(removeTally(session, item, i, now()))}
                  className="h-11 w-11 text-slate-500"
                >
                  ✕
                </button>
              </li>
            ),
          )}
          {line.status === 'in-progress' && <li className="text-slate-500">{tallies.map(formatQuantity).join(' + ')} + …</li>}
        </ul>
      )}

      {line.status === 'finished' && (
        <>
          <div data-testid="line" className="mt-3 grid grid-cols-2 gap-2 text-sm tabular-nums">
            <p className="rounded-xl bg-slate-50 p-2">
              {item.expected === null ? 'Expected unreadable' : `Expected ${formatQuantity(item.expected)}`}
            </p>
            <p className="rounded-xl bg-slate-50 p-2">
              Count {formatQuantity(line.count)}
              {line.tallies.length > 1 && ` (${line.tallies.map(formatQuantity).join(' + ')})`}
            </p>
            {line.variance !== null && line.value !== null && (
              <>
                <p className="rounded-xl bg-slate-50 p-2">Variance {signed(line.variance)} </p>
                <p
                  className={`whitespace-nowrap rounded-xl p-2 text-base font-bold ${
                    line.value < 0 ? 'bg-rose-50 text-rose-800' : line.value > 0 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50'
                  }`}
                >
                  {formatUsd(line.value)}
                </p>
              </>
            )}
          </div>
          {line.lookAgain && (
            <p className="mt-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <b>Look again:</b> {LOOK_AGAIN_TEXT[line.lookAgain]}
            </p>
          )}
        </>
      )}
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (line.status === 'finished') {
            const next = withTyped(false);
            if (next) onChange(next);
          } else done();
        }}
      >
        <input
          aria-label="Count"
          inputMode="decimal"
          autoComplete="off"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="0"
          className="h-16 w-full rounded-2xl border-2 border-slate-300 px-4 text-center text-3xl font-semibold tabular-nums outline-none placeholder:text-slate-300 focus:border-brand-blue"
        />
        {echo && <p className="text-center text-sm text-slate-600">{echo}</p>}
        {line.status === 'finished' ? (
          <button type="submit" className="h-14 w-full rounded-2xl bg-brand-blue text-lg font-bold text-white shadow-sm active:bg-brand-deep">
            Add
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={another}
              className="h-14 w-2/5 rounded-2xl border-2 border-slate-300 bg-white text-sm font-semibold text-slate-700"
            >
              <span aria-hidden>+ </span>Another place
            </button>
            <button
              type="submit"
              className="h-14 flex-1 rounded-2xl bg-brand-blue text-lg font-bold text-white shadow-sm active:bg-brand-deep"
            >
              Done <span aria-hidden>✓</span>
            </button>
          </div>
        )}
      </form>
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}

    </section>
  );
}

function TallyEditor({ initial, onSave, onCancel }: { initial: string; onSave: (v: number) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const parsed = parseTally(text);
  return (
    <li>
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          if (parsed.ok) onSave(parsed.value);
        }}
      >
        <input
          aria-label="Edit Tally"
          inputMode="decimal"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 w-20 rounded-xl border-2 border-slate-300 px-2 text-base"
        />
        <button type="submit" disabled={!parsed.ok} className="h-11 px-2 font-semibold text-emerald-700">
          Save
        </button>
        <button type="button" onClick={onCancel} className="h-11 px-2 text-slate-500">
          Cancel
        </button>
      </form>
    </li>
  );
}

const signed = (thousandths: number) => (thousandths > 0 ? `+${formatQuantity(thousandths)}` : formatQuantity(thousandths));
