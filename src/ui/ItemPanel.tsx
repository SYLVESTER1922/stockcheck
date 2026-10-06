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
    <section data-testid="item-panel" className="mt-3 rounded-lg bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between">
        <p className="font-semibold">
          {item.name} <span className="font-normal text-slate-500">{item.variant}</span>
          {item.duplicate !== null && (
            <span className="ml-1 text-xs text-amber-700">
              #{item.duplicate} · {formatUsd(item.cost)}
            </span>
          )}
        </p>
        <button onClick={onClose} aria-label="Close" className="px-2 text-slate-400">
          ✕
        </button>
      </div>

      {tallies.length > 0 && (
        <ul className="mt-2 flex flex-wrap items-center gap-1 text-sm tabular-nums">
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
              <li key={i} className="flex items-center rounded bg-slate-100">
                <button aria-label={`Edit ${formatQuantity(t)}`} onClick={() => setEditing(i)} className="px-2 py-1">
                  {formatQuantity(t)}
                </button>
                <button
                  aria-label={`Remove ${formatQuantity(t)}`}
                  onClick={() => onChange(removeTally(session, item, i, now()))}
                  className="px-1 text-slate-400"
                >
                  ✕
                </button>
              </li>
            ),
          )}
          {line.status === 'in-progress' && <li className="text-slate-500">{tallies.map(formatQuantity).join(' + ')} + …</li>}
        </ul>
      )}

      <form
        className="mt-2 flex flex-wrap items-center gap-2"
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
          className="w-28 rounded-lg border border-slate-300 p-2 text-lg tabular-nums"
        />
        {line.status === 'finished' ? (
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
            Add
          </button>
        ) : (
          <>
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
              Done
            </button>
            <button type="button" onClick={another} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              Another place
            </button>
          </>
        )}
        {echo && <span className="text-sm text-slate-600">{echo}</span>}
      </form>
      {error && <p className="mt-1 text-sm text-rose-700">{error}</p>}

      {line.status === 'finished' && (
        <>
          <p data-testid="line" className="mt-3 text-sm tabular-nums">
            {item.expected === null ? 'Expected unreadable' : `Expected ${formatQuantity(item.expected)}`} · Count{' '}
            {formatQuantity(line.count)}
            {line.tallies.length > 1 && ` (${line.tallies.map(formatQuantity).join(' + ')})`}
            {line.variance !== null && line.value !== null && (
              <>
                {' '}
                · Variance {signed(line.variance)} · <b>{formatUsd(line.value)}</b>
              </>
            )}
          </p>
          {line.lookAgain && (
            <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
              Look again: {LOOK_AGAIN_TEXT[line.lookAgain]}
            </p>
          )}
        </>
      )}
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
          className="w-20 rounded border border-slate-300 px-1"
        />
        <button type="submit" disabled={!parsed.ok} className="px-1 text-emerald-700">
          Save
        </button>
        <button type="button" onClick={onCancel} className="px-1 text-slate-400">
          Cancel
        </button>
      </form>
    </li>
  );
}

const signed = (thousandths: number) => (thousandths > 0 ? `+${formatQuantity(thousandths)}` : formatQuantity(thousandths));
